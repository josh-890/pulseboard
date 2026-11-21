import { describe, expect, it } from "vitest";
import { aspectOf, cropStyle, defaultCrop, fitCrop, moveCrop, resizeCrop } from "@/lib/tag-example";

// Example crops (ADR-0042, S4): fractions of the photo, always the tile's shape.

const shape = (c: { w: number; h: number }, imageAspect: number) => (c.w * imageAspect) / c.h;

describe("tag example crops", () => {
  it("reads a tile aspect", () => {
    expect(aspectOf("3:4")).toBe(0.75);
    expect(aspectOf("1:1")).toBe(1);
    expect(aspectOf("nonsense")).toBe(1);
  });

  it("starts as the largest centred crop of the tile's shape", () => {
    // a landscape photo (3:2) into a 3:4 tile: full height, a centred slice
    const c = defaultCrop(1.5, 0.75);
    expect(c.h).toBeCloseTo(1);
    expect(c.w).toBeCloseTo(0.5);
    expect(c.x).toBeCloseTo(0.25);
    expect(shape(c, 1.5)).toBeCloseTo(0.75);
    // a portrait photo (2:3) into a square tile: full width
    const s = defaultCrop(2 / 3, 1);
    expect(s.w).toBeCloseTo(1);
    expect(shape(s, 2 / 3)).toBeCloseTo(1);
  });

  it("moves inside the photo and keeps its shape when resized", () => {
    const c = defaultCrop(1.5, 0.75);
    expect(moveCrop(c, 1, 1, 1.5, 0.75)).toMatchObject({ x: 0.5, y: 0 });
    const r = resizeCrop({ x: 0.1, y: 0.1, w: 0.2, h: 0.4 }, 0.1, 1.5, 0.75);
    expect(r.w).toBeCloseTo(0.3);
    expect(shape(r, 1.5)).toBeCloseTo(0.75);
    // never past the photo's edge
    const big = resizeCrop({ x: 0.1, y: 0.1, w: 0.2, h: 0.4 }, 5, 1.5, 0.75);
    expect(big.y + big.h).toBeLessThanOrEqual(1.0000001);
    expect(fitCrop({ x: 0.9, y: 0.9, w: 0.5, h: 1 }, 1, 1)).toMatchObject({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("positions the image so the crop fills the box", () => {
    expect(cropStyle({ x: 0.25, y: 0, w: 0.5, h: 1 })).toEqual({ width: "200.000%", height: "100.000%", left: "-50.000%", top: "0.000%" });
  });
});
