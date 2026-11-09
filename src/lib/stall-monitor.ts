import type { Pool } from "pg";

// Why does a click sometimes hang for a while and then go through (2026-11-09)?
// Three suspects, each logged only when it happens, so `docker logs` names the
// cause of the next freeze without anyone watching:
//   [stall] event loop  — the app process itself was busy (a long synchronous job)
//   [stall] db pool     — queries waited for a free connection (pool exhausted)
//   [stall] slow query  — Postgres took long (busy VM, a lock, a heavy query)
// A query's duration includes any time the event loop was blocked, so slow
// queries are judged a tick later with that time taken out — otherwise one
// block reports every query in flight as slow.
// Costs one timer tick every 250 ms and a comparison per query; silent otherwise.

const TICK_MS = 250;
/** A tick this late means the event loop was blocked */
const LOOP_LAG_MS = 500;
/** Queries waiting this long for a connection */
const POOL_WAIT_MS = 1_000;
/** A single query taking this long, not counting event-loop blocks */
export const SLOW_QUERY_MS = 1_000;
/** How far back block history reaches — longer queries are judged against what is kept */
const HISTORY_MS = 120_000;

type PoolWatch = { pool: Pool; waitingSince: number | null; worst: number };
type PendingQuery = { tenant: string; duration: number; query: string; at: number };
type Sample = { t: number; blocked: number };

type MonitorState = {
  started: boolean;
  pools: Map<string, PoolWatch>;
  pending: PendingQuery[];
  /** Event-loop lag summed since start, sampled per tick */
  blocked: number;
  samples: Sample[];
};

// On globalThis: Next bundles server code into several chunks, and one monitor
// per process is the point
const g = globalThis as typeof globalThis & { __stallMonitor?: MonitorState };
const state: MonitorState = (g.__stallMonitor ??= { started: false, pools: new Map(), pending: [], blocked: 0, samples: [] });

/**
 * Only inside the Next.js server, and in production — dev compiles block the
 * loop all the time. STALL_MONITOR=1 turns it on anywhere in the Next server.
 */
function enabled(): boolean {
  return process.env.NEXT_RUNTIME === "nodejs" && (process.env.NODE_ENV === "production" || process.env.STALL_MONITOR === "1");
}

function stamp(): string {
  return new Date().toISOString();
}

/** Loop-block time summed up to time t (the latest sample at or before it) */
function blockedAt(t: number): number {
  let value = 0;
  for (const s of state.samples) {
    if (s.t > t) break;
    value = s.blocked;
  }
  return value;
}

function tick(now: number, lag: number): void {
  // A query's result is handled after the tick that ends a block, so by now
  // every block it sat through is counted
  if (lag > 0) state.blocked += lag;
  state.samples.push({ t: now, blocked: state.blocked });
  while (state.samples.length > 0 && state.samples[0].t < now - HISTORY_MS) state.samples.shift();

  if (lag > LOOP_LAG_MS) {
    console.warn(`[stall] ${stamp()} event loop blocked ~${Math.round(lag)} ms — the app process was busy`);
  }

  let delayed = 0;
  for (const q of state.pending) {
    const during = state.blocked - blockedAt(q.at - q.duration);
    const own = q.duration - during;
    if (own >= SLOW_QUERY_MS) {
      const note = during >= LOOP_LAG_MS ? ` (+${Math.round(during)} ms the event loop was blocked)` : "";
      console.warn(`[stall] ${stamp()} slow query ${q.tenant} ${Math.round(own)} ms${note}: ${q.query.replace(/\s+/g, " ").slice(0, 240)}`);
    } else {
      delayed++;
    }
  }
  state.pending = [];
  if (delayed > 0) {
    console.warn(`[stall] ${stamp()} ${delayed} ${delayed === 1 ? "query" : "queries"} looked slow only because the event loop was blocked`);
  }

  for (const [tenant, w] of state.pools) {
    const { waitingCount, totalCount, idleCount } = w.pool;
    if (waitingCount > 0) {
      w.waitingSince ??= now;
      w.worst = Math.max(w.worst, waitingCount);
    } else if (w.waitingSince !== null) {
      const waited = now - w.waitingSince;
      if (waited >= POOL_WAIT_MS) {
        console.warn(
          `[stall] ${stamp()} db pool ${tenant}: queries waited ~${Math.round(waited)} ms for a connection (up to ${w.worst} waiting; ${totalCount} open, ${idleCount} idle)`,
        );
      }
      w.waitingSince = null;
      w.worst = 0;
    }
  }
}

function start(): void {
  if (state.started || !enabled()) return;
  state.started = true;
  console.info(`[stall] monitor on — logs event-loop blocks > ${LOOP_LAG_MS} ms, pool waits > ${POOL_WAIT_MS} ms, queries > ${SLOW_QUERY_MS} ms`);
  let last = performance.now();
  state.samples.push({ t: last, blocked: 0 });
  const timer = setInterval(() => {
    const now = performance.now();
    const lag = now - last - TICK_MS;
    last = now;
    tick(now, lag);
  }, TICK_MS);
  // Never keep a process alive for the monitor's sake
  timer.unref();
}

/** Watch a tenant's connection pool (and start the monitor on first use) */
export function watchPool(tenant: string, pool: Pool): void {
  if (!enabled()) return;
  state.pools.set(tenant, { pool, waitingSince: null, worst: 0 });
  start();
}

/** A query that took long — judged on the next tick, the SQL shape only, never its parameters */
export function reportSlowQuery(tenant: string, durationMs: number, query: string): void {
  if (!state.started || durationMs < SLOW_QUERY_MS) return;
  state.pending.push({ tenant, duration: durationMs, query, at: performance.now() });
}

/** Time the steps of a user action; logs them only when the whole took long */
export function stepTimer(label: string, thresholdMs = 1_000): { step: (name: string) => void; done: () => void } {
  const t0 = performance.now();
  let prev = t0;
  const steps: string[] = [];
  return {
    step(name) {
      const now = performance.now();
      steps.push(`${name} ${Math.round(now - prev)} ms`);
      prev = now;
    },
    done() {
      const total = performance.now() - t0;
      if (enabled() && total >= thresholdMs) console.warn(`[stall] ${stamp()} ${label} took ${Math.round(total)} ms (${steps.join(", ")})`);
    },
  };
}
