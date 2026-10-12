import { describe, expect, it } from "vitest";
import { CLICK_ZOOM, MAX_ZOOM, ZOOM_RESET, clampZoom, panBy, toggleZoomAt, zoomAt } from "@/lib/comparison-zoom";

// A content point v shows at u = t + s·v
const shownAt = (z: { scale: number; tx: number; ty: number }, vx: number, vy: number) => [z.tx + z.scale * vx, z.ty + z.scale * vy];

describe("comparison zoom", () => {
  it("keeps the clicked point under the cursor", () => {
    const z = zoomAt(ZOOM_RESET, 0.5, 0.5, CLICK_ZOOM);
    const [ux, uy] = shownAt(z, 0.5, 0.5);
    expect(ux).toBeCloseTo(0.5);
    expect(uy).toBeCloseTo(0.5);
  });

  it("never shows an empty edge — a click at a corner stays inside", () => {
    const z = zoomAt(ZOOM_RESET, 0, 1, CLICK_ZOOM);
    expect(z.tx).toBe(0);
    expect(z.ty).toBeCloseTo(1 - CLICK_ZOOM);
    const panned = panBy(z, 5, -5);
    expect(panned.tx).toBe(0);
    expect(panned.ty).toBeCloseTo(1 - CLICK_ZOOM);
  });

  it("a click zooms in, the next click zooms out", () => {
    const z = toggleZoomAt(ZOOM_RESET, 0.3, 0.6);
    expect(z.scale).toBe(CLICK_ZOOM);
    expect(toggleZoomAt(z, 0.3, 0.6)).toEqual(ZOOM_RESET);
  });

  it("limits the scale", () => {
    expect(clampZoom({ scale: 50, tx: 0, ty: 0 }).scale).toBe(MAX_ZOOM);
    expect(clampZoom({ scale: 0.2, tx: -3, ty: 1 })).toEqual(ZOOM_RESET);
  });

  it("pans in frame units", () => {
    const z = zoomAt(ZOOM_RESET, 0.5, 0.5, 2);
    expect(panBy(z, 0.1, 0).tx).toBeCloseTo(z.tx + 0.1);
  });
});
