import { describe, expect, it } from "vitest";
import {
  isRematchRunning,
  isRematchStalled,
  STALE_AFTER_MS,
  type RematchStatus,
} from "@/lib/services/archive-rematch-status";

// Whether the archive matching pass is still alive.
//
// The pass outlives the request that starts it, so "is it running?" can only be
// answered from a heartbeat. Both wrong answers cost something: call a dead run
// alive and the button is blocked for ever after one crash or container rebuild;
// call a live run dead and two passes fight over the same links.

const NOW = Date.parse("2026-08-16T18:00:00.000Z");

const status = (over: Partial<RematchStatus> = {}): RematchStatus => ({
  startedAt: "2026-08-16T17:55:00.000Z",
  progressAt: "2026-08-16T17:59:30.000Z",
  finishedAt: null,
  total: 36000,
  processed: 1200,
  suggested: 14,
  error: null,
  ...over,
});

describe("isRematchRunning", () => {
  it("is running while the heartbeat is fresh", () => {
    expect(isRematchRunning(status(), NOW)).toBe(true);
  });

  it("is not running once the pass reported it finished", () => {
    expect(isRematchRunning(status({ finishedAt: "2026-08-16T17:59:40.000Z" }), NOW)).toBe(false);
  });

  it("is not running after a failure", () => {
    expect(isRematchRunning(status({ error: "connection lost" }), NOW)).toBe(false);
  });

  // A container rebuild kills the pass mid-run; the record is left saying
  // "started". Without the timeout the button would never come back.
  it("gives up on a heartbeat that stopped", () => {
    const dead = status({ progressAt: new Date(NOW - STALE_AFTER_MS - 1000).toISOString() });
    expect(isRematchRunning(dead, NOW)).toBe(false);
    expect(isRematchStalled(dead, NOW)).toBe(true);
  });

  it("treats no record at all as not running", () => {
    expect(isRematchRunning(null, NOW)).toBe(false);
    expect(isRematchStalled(null, NOW)).toBe(false);
  });

  // A finished run is not stalled — the two states must not both light up.
  it("does not call a finished run stalled", () => {
    expect(isRematchStalled(status({ finishedAt: "2026-08-16T17:59:40.000Z" }), NOW)).toBe(false);
  });
});
