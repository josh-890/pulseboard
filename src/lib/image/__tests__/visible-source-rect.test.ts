import { describe, expect, it } from "vitest";
import { visibleSourceRect } from "@/lib/image/bake-geometry";
import type { AffineMatrix } from "@/lib/image/similarity-transform";

/** Canvas-convention similarity: scale s, rotation deg, translation (e,f). */
function sim(s: number, deg: number, e: number, f: number): AffineMatrix {
  const r = (deg * Math.PI) / 180;
  return { a: s * Math.cos(r), b: s * Math.sin(r), c: -s * Math.sin(r), d: s * Math.cos(r), e, f };
}

/** Forward-map a source point through the matrix. */
function fwd(m: AffineMatrix, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

describe("visibleSourceRect", () => {
  it("returns the whole image for the identity transform onto a same-size canvas", () => {
    const r = visibleSourceRect(sim(1, 0, 0, 0), 1000, 800, 1000, 800);
    expect(r).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it("clips to the visible window and never exceeds the source bounds", () => {
    // Identity, but the canvas only covers a 200x100 window at source (500,400).
    const r = visibleSourceRect(sim(1, 0, -500, -400), 200, 100, 4000, 3000);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(4000);
    expect(r.y + r.h).toBeLessThanOrEqual(3000);
    // The window plus a small kernel margin — nowhere near the full image.
    expect(r.w).toBeLessThan(240);
    expect(r.h).toBeLessThan(140);
  });

  it("covers every source pixel the canvas can actually sample", () => {
    // Property: map the rect's corners forward; the canvas must be inside them.
    const m = sim(0.8, 17, 120, -60);
    const [bw, bh, sw, sh] = [1365, 2048, 8481, 5584];
    const r = visibleSourceRect(m, bw, bh, sw, sh);
    const corners = [
      fwd(m, r.x, r.y),
      fwd(m, r.x + r.w, r.y),
      fwd(m, r.x, r.y + r.h),
      fwd(m, r.x + r.w, r.y + r.h),
    ];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    // Allowing for rotation, the rect's image must enclose the whole canvas.
    expect(minX).toBeLessThanOrEqual(0);
    expect(minY).toBeLessThanOrEqual(0);
    expect(maxX).toBeGreaterThanOrEqual(bw);
    expect(maxY).toBeGreaterThanOrEqual(bh);
  });

  it("pads more generously the harder the bake downscales", () => {
    // One output pixel samples ~1/scale source pixels, so the kernel margin grows.
    const tight = visibleSourceRect(sim(1, 0, -2000, -1500), 500, 500, 8000, 6000);
    const loose = visibleSourceRect(sim(0.2, 0, -400, -300), 500, 500, 8000, 6000);
    const tightPad = tight.w - 500;
    const loosePad = loose.w - 2500;
    expect(loosePad).toBeGreaterThan(tightPad);
  });

  it("falls back to the whole image on a singular or non-finite matrix", () => {
    const singular: AffineMatrix = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    expect(visibleSourceRect(singular, 100, 100, 640, 480)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
    const nan: AffineMatrix = { a: NaN, b: 0, c: 0, d: 1, e: 0, f: 0 };
    expect(visibleSourceRect(nan, 100, 100, 640, 480)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });

  it("falls back to the whole image when the canvas maps entirely off-source", () => {
    // Nothing of the source is visible — must not hand the renderer an empty rect.
    const r = visibleSourceRect(sim(1, 0, 50_000, 50_000), 100, 100, 640, 480);
    expect(r).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });

  it("cuts the work dramatically on the real archive original that stalled GDI+", () => {
    // Lotta - Voyeur Photos - 021.jpg: 8481x5584 source, 1365x2048 bake, scale 1.0.
    // Measured against the production worklist: ~7% of the image is ever sampled,
    // i.e. GDI+ was resampling 47.4 MP to produce a 2.8 MP crop.
    const m = sim(1, 0, -3336, -2292);
    const r = visibleSourceRect(m, 1365, 2048, 8481, 5584);
    const fraction = (r.w * r.h) / (8481 * 5584);
    expect(fraction).toBeLessThan(0.1);
    expect(fraction).toBeGreaterThan(0.05); // sanity: the crop is real, not empty
  });
});
