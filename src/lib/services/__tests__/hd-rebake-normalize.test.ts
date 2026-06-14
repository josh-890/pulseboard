import { describe, expect, it } from "vitest";
import { normalizeKeypoints } from "@/lib/services/hd-rebake-service";

describe("normalizeKeypoints (ADR-0017)", () => {
  it("returns v2 fractional keypoints as-is", () => {
    const prov = { version: 2, sourceMediaItemId: "m1", keypoints: { left: { x: 0.4, y: 0.5 }, right: { x: 0.6, y: 0.5 } } };
    expect(normalizeKeypoints(prov, 3000, 4000)).toEqual({ left: { x: 0.4, y: 0.5 }, right: { x: 0.6, y: 0.5 } });
  });

  it("normalizes v1 pixel points against the master dims (downscaled source)", () => {
    // 8000x6000 original → master fit inside 4000 → 4000x3000. The master centre
    // (2000,1500) is fraction (0.5,0.5); a quarter point (1000,750) is (0.25,0.25).
    const prov = { sourceMediaItemId: "m1", points: { c: { x: 2000, y: 1500 }, q: { x: 1000, y: 750 } }, matrix: {} };
    const out = normalizeKeypoints(prov, 8000, 6000)!;
    expect(out.c.x).toBeCloseTo(0.5, 6);
    expect(out.c.y).toBeCloseTo(0.5, 6);
    expect(out.q.x).toBeCloseTo(0.25, 6);
  });

  it("normalizes v1 points when the source was already <= master (no downscale)", () => {
    // 1000x800 source → master == source. Point (250,200) → (0.25, 0.25).
    const prov = { points: { a: { x: 250, y: 200 }, b: { x: 750, y: 200 } } };
    const out = normalizeKeypoints(prov, 1000, 800)!;
    expect(out.a).toEqual({ x: 0.25, y: 0.25 });
    expect(out.b).toEqual({ x: 0.75, y: 0.25 });
  });

  it("rejects provenance with fewer than two keypoints", () => {
    expect(normalizeKeypoints({ points: { only: { x: 1, y: 1 } } }, 1000, 1000)).toBeNull();
    expect(normalizeKeypoints({ version: 2, keypoints: { only: { x: 0.5, y: 0.5 } } }, 1000, 1000)).toBeNull();
  });

  it("rejects malformed / empty provenance", () => {
    expect(normalizeKeypoints(null, 1000, 1000)).toBeNull();
    expect(normalizeKeypoints({}, 1000, 1000)).toBeNull();
    expect(normalizeKeypoints({ points: {} }, 0, 0)).toBeNull();
  });
});
