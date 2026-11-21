import { describe, expect, it } from "vitest";
import { aspectOf, boxFromCorners, cropFromBox, cropStyle, FRAMING } from "@/lib/tag-example";

// Example crops (ADR-0042, S4): a box around the subject, framed by the path's rule.

describe("tag example crops", () => {
  it("reads a tile aspect", () => {
    expect(aspectOf("3:4")).toBe(0.75);
    expect(aspectOf("1:1")).toBe(1);
    expect(aspectOf("nonsense")).toBe(1);
  });

  it("positions the image so the crop fills the box", () => {
    expect(cropStyle({ x: 0.25, y: 0, w: 0.5, h: 1 })).toEqual({ width: "200.000%", height: "100.000%", left: "-50.000%", top: "0.000%" });
  });
});

describe("comparable examples: box + framing rule", () => {
  it("a standing person fills 85 % of a 3:4 tile, head 7 % below the top", () => {
    // portrait photo 2:3; the person 60 % of the photo's height, centred
    const box = { x: 0.4, y: 0.2, w: 0.2, h: 0.6 };
    const c = cropFromBox(box, 2 / 3, 0.75, FRAMING.Figure);
    expect(box.h / c.h).toBeCloseTo(0.85);
    expect((box.y - c.y) / c.h).toBeCloseTo(0.07);
    expect((c.w * (2 / 3)) / c.h).toBeCloseTo(0.75); // the tile's shape
    expect(c.x + c.w / 2).toBeCloseTo(0.5); // centred on the person
  });

  it("the same person half as big ends up the same size in the tile", () => {
    const big = cropFromBox({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 }, 2 / 3, 0.75, FRAMING.Figure);
    const small = cropFromBox({ x: 0.45, y: 0.3, w: 0.1, h: 0.3 }, 2 / 3, 0.75, FRAMING.Figure);
    expect(0.6 / big.h).toBeCloseTo(0.3 / small.h);
  });

  it("a lying person keeps the scale: framed by its width, centred, a mat where the photo ends", () => {
    const box = { x: 0.1, y: 0.6, w: 0.8, h: 0.15 };
    const c = cropFromBox(box, 1.5, 0.75, FRAMING.Figure);
    expect(box.w / c.w).toBeCloseTo(0.85);
    expect(c.x + c.w / 2).toBeCloseTo(0.5);
    expect(c.y + c.h / 2).toBeCloseTo(0.675);
    expect(c.h).toBeGreaterThan(1); // taller than the photo: bands above and below
  });

  it("a crop that fits is pushed inside; one bigger than the photo stays centred", () => {
    const c = cropFromBox({ x: 0, y: 0, w: 1, h: 1 }, 1, 1, FRAMING.Clothing);
    expect(c.w).toBeCloseTo(1 / 0.85);
    expect(c.x + c.w / 2).toBeCloseTo(0.5);
    const edge = cropFromBox({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, 1, 1, FRAMING.Clothing);
    expect(edge.x + edge.w).toBeLessThanOrEqual(1.000001);
    expect(edge.y + edge.h).toBeLessThanOrEqual(1.000001);
    const b = boxFromCorners(0.8, 0.9, 0.2, -0.1);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBe(0);
    expect(b.w).toBeCloseTo(0.6);
    expect(b.h).toBeCloseTo(0.9);
  });
});
