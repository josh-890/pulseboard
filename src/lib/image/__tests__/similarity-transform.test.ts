import { describe, expect, it } from "vitest";
import { computeSimilarityTransform, applyAffine, type Pt } from "@/lib/image/similarity-transform";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe("computeSimilarityTransform", () => {
  it("requires at least 2 point pairs", () => {
    expect(() => computeSimilarityTransform([{ x: 0, y: 0 }], [{ x: 0, y: 0 }])).toThrow();
  });

  it("throws when source points are coincident", () => {
    expect(() =>
      computeSimilarityTransform(
        [{ x: 5, y: 5 }, { x: 5, y: 5 }],
        [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      ),
    ).toThrow();
  });

  it("recovers pure translation (2 pts)", () => {
    const fit = computeSimilarityTransform(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 5, y: 7 }, { x: 15, y: 7 }],
    );
    expect(close(fit.scale, 1)).toBe(true);
    expect(close(fit.rotationDeg, 0)).toBe(true);
    expect(applyAffine(fit.matrix, { x: 0, y: 0 })).toEqual({ x: 5, y: 7 });
  });

  it("recovers uniform scale (2 pts)", () => {
    const fit = computeSimilarityTransform(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    );
    expect(close(fit.scale, 2)).toBe(true);
    expect(close(fit.rotationDeg, 0)).toBe(true);
  });

  it("recovers 90° rotation (2 pts)", () => {
    const fit = computeSimilarityTransform(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: 0, y: 1 }],
    );
    expect(close(fit.scale, 1)).toBe(true);
    expect(close(Math.abs(fit.rotationDeg), 90)).toBe(true);
    const mapped = applyAffine(fit.matrix, { x: 1, y: 0 });
    expect(close(mapped.x, 0)).toBe(true);
    expect(close(mapped.y, 1)).toBe(true);
  });

  it("is a pure similarity (a==d, c==-b) — no shear/reflection", () => {
    const fit = computeSimilarityTransform(
      [{ x: 1, y: 2 }, { x: 4, y: 9 }, { x: -3, y: 5 }],
      [{ x: 10, y: 1 }, { x: 22, y: 30 }, { x: -2, y: 14 }],
    );
    const m = fit.matrix;
    expect(close(m.a, m.d)).toBe(true);
    expect(close(m.c, -m.b)).toBe(true);
  });

  it("exactly fits 3 points that lie on a similarity (eye/eye/mouth → targets)", () => {
    // A known transform: scale 2, rotate 90°, translate (100, 50).
    const s = 2;
    const rad = Math.PI / 2;
    const tx = 100;
    const ty = 50;
    const fwd = (p: Pt): Pt => ({
      x: s * (Math.cos(rad) * p.x - Math.sin(rad) * p.y) + tx,
      y: s * (Math.sin(rad) * p.x + Math.cos(rad) * p.y) + ty,
    });
    const src: Pt[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 25 }];
    const dst = src.map(fwd);
    const fit = computeSimilarityTransform(src, dst);
    expect(close(fit.scale, 2, 1e-6)).toBe(true);
    for (let i = 0; i < src.length; i++) {
      const m = applyAffine(fit.matrix, src[i]);
      expect(close(m.x, dst[i].x, 1e-6)).toBe(true);
      expect(close(m.y, dst[i].y, 1e-6)).toBe(true);
    }
  });
});
