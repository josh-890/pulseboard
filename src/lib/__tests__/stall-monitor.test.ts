import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

// The stall monitor (2026-11-09): silent unless something is slow, only inside
// the Next.js server, and a query is not blamed for time the event loop was blocked.

const ENV = { runtime: process.env.NEXT_RUNTIME, flag: process.env.STALL_MONITOR };

let clock = 0;
let warn: ReturnType<typeof vi.spyOn>;

async function freshMonitor() {
  vi.resetModules();
  delete (globalThis as { __stallMonitor?: unknown }).__stallMonitor;
  return import("@/lib/stall-monitor");
}

/** Start the monitor with an idle pool; returns the module and the pool's counters */
async function running() {
  const m = await freshMonitor();
  const pool = { waitingCount: 0, totalCount: 10, idleCount: 10 };
  m.watchPool("pulse", pool as unknown as Pool);
  return { m, pool };
}

/** One tick of the monitor, arriving `late` ms after it was due */
function tick(late = 0) {
  clock += 250 + late;
  vi.advanceTimersByTime(250);
}

const lines = () => warn.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  process.env.NEXT_RUNTIME = "nodejs";
  process.env.STALL_MONITOR = "1";
  clock = 0;
  vi.useFakeTimers({ toFake: ["setInterval"] });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const [key, value] of [["NEXT_RUNTIME", ENV.runtime], ["STALL_MONITOR", ENV.flag]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("stall monitor", () => {
  it("stays silent outside the Next.js server (scripts, agents, tests)", async () => {
    delete process.env.NEXT_RUNTIME;
    const { m } = await running();
    m.reportSlowQuery("pulse", 5_000, "SELECT 1");
    tick(3_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a slow query's SQL shape on the next tick, never a fast one", async () => {
    const { m } = await running();
    tick();
    m.reportSlowQuery("pulse", 200, "SELECT fast");
    m.reportSlowQuery("xpulse", 2_400, 'SELECT *\n  FROM "ArchiveLink"   WHERE id = $1');
    expect(warn).not.toHaveBeenCalled();
    tick();
    expect(lines()).toEqual([expect.stringMatching(/slow query xpulse 2400 ms: SELECT \* FROM "ArchiveLink" WHERE id = \$1$/)]);
  });

  it("does not blame a query for an event-loop block it sat through", async () => {
    const { m } = await running();
    for (let i = 0; i < 8; i++) tick();
    tick(1_300); // the loop was blocked 1.3 s
    m.reportSlowQuery("pulse", 1_400, "SELECT held up");
    tick();
    expect(lines()).toEqual([
      expect.stringMatching(/event loop blocked ~1300 ms/),
      expect.stringMatching(/1 query looked slow only because the event loop was blocked/),
    ]);
  });

  it("still reports a query that was slow on its own, with the block noted", async () => {
    const { m } = await running();
    for (let i = 0; i < 20; i++) tick();
    tick(1_000);
    m.reportSlowQuery("pulse", 4_000, "SELECT really slow");
    tick();
    expect(lines()[1]).toMatch(/slow query pulse 3000 ms \(\+1000 ms the event loop was blocked\): SELECT really slow/);
  });

  it("step timer: logs each step when the whole was slow, silent when quick", async () => {
    const { m } = await running();
    const quick = m.stepTimer("quick");
    quick.step("a");
    quick.done();
    expect(warn).not.toHaveBeenCalled();
    const t = m.stepTimer("link folder f → staging s");
    clock += 30;
    t.step("folder");
    clock += 1_500;
    t.step("upsert");
    clock += 30;
    t.done();
    expect(lines()).toEqual([expect.stringMatching(/link folder f → staging s took 1560 ms \(folder 30 ms, upsert 1500 ms\)/)]);
  });

  it("reports how long queries waited for a pool connection, once the wait ends", async () => {
    const { pool } = await running();
    pool.waitingCount = 3;
    pool.idleCount = 0;
    for (let i = 0; i < 7; i++) tick();
    expect(warn).not.toHaveBeenCalled();
    pool.waitingCount = 0;
    tick();
    expect(lines()).toEqual([expect.stringMatching(/db pool pulse: queries waited ~1750 ms for a connection \(up to 3 waiting; 10 open, 0 idle\)/)]);
  });
});
