import { describe, expect, it } from "vitest";
import { bakeDimensions, computeBakeMatrix, parseTemplateKeypoints } from "@/lib/image/bake-geometry";
import { applyAffine } from "@/lib/image/similarity-transform";

const TEMPLATE = [
  { name: "left_eye", x: 0.38, y: 0.4 },
  { name: "right_eye", x: 0.62, y: 0.4 },
  { name: "mouth", x: 0.5, y: 0.62 },
];

describe("bake-geometry (ADR-0017)", () => {
  it("derives portrait/landscape output dims from aspect + long side", () => {
    expect(bakeDimensions(2, 3, 600)).toEqual({ bakeW: 400, bakeH: 600 });
    expect(bakeDimensions(3, 2, 600)).toEqual({ bakeW: 600, bakeH: 400 });
  });

  it("maps source keypoints onto the template targets in output pixels (2-point exact fit)", () => {
    const { bakeW, bakeH } = bakeDimensions(2, 3, 600);
    // Two keypoints → a similarity is exactly determined, so they land on target.
    const eyes = TEMPLATE.slice(0, 2);
    const fracs = { left_eye: { x: 0.30, y: 0.25 }, right_eye: { x: 0.70, y: 0.25 } };
    const m = computeBakeMatrix(eyes, fracs, 4000, 6000, bakeW, bakeH)!;
    for (const tk of eyes) {
      const out = applyAffine(m, { x: fracs[tk.name as keyof typeof fracs].x * 4000, y: fracs[tk.name as keyof typeof fracs].y * 6000 });
      expect(out.x).toBeCloseTo(tk.x * bakeW, 4);
      expect(out.y).toBeCloseTo(tk.y * bakeH, 4);
    }
  });

  it("is resolution-independent — same fractions on a 2x source give the same framing", () => {
    const { bakeW, bakeH } = bakeDimensions(2, 3, 600);
    const fracs = { left_eye: { x: 0.30, y: 0.25 }, right_eye: { x: 0.70, y: 0.25 }, mouth: { x: 0.50, y: 0.55 } };
    const lo = computeBakeMatrix(TEMPLATE, fracs, 2000, 3000, bakeW, bakeH)!;
    const hi = computeBakeMatrix(TEMPLATE, fracs, 4000, 6000, bakeW, bakeH)!;
    // A source fraction maps to the same output pixel regardless of source resolution.
    const pLo = applyAffine(lo, { x: 0.5 * 2000, y: 0.5 * 3000 });
    const pHi = applyAffine(hi, { x: 0.5 * 4000, y: 0.5 * 6000 });
    expect(pLo.x).toBeCloseTo(pHi.x, 4);
    expect(pLo.y).toBeCloseTo(pHi.y, 4);
    // ...but the HD matrix samples from twice the pixels (half the output-per-source scale).
    expect(Math.hypot(hi.a, hi.b)).toBeCloseTo(Math.hypot(lo.a, lo.b) / 2, 6);
  });

  it("returns null when a template keypoint has no source fraction", () => {
    expect(computeBakeMatrix(TEMPLATE, { left_eye: { x: 0.3, y: 0.3 } }, 100, 100, 40, 60)).toBeNull();
  });

  it("parses template keypoints from JSON, skipping malformed entries", () => {
    expect(parseTemplateKeypoints([{ name: "a", x: 0.1, y: 0.2 }, { x: 1 }, null])).toEqual([{ name: "a", x: 0.1, y: 0.2 }]);
  });
});
