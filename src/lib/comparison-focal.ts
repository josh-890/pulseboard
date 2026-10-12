// Framing a photo in a comparison cell (Fill / COVER, ADR-0015). The photo is
// scaled to cover the cell, so it overflows along one axis; the stored focal
// point (fx, fy — a point in the photo, 0..1) is placed in the cell's centre,
// held at the edges so no empty strip shows. All maths is in cell units (the
// cell is 1 × 1), so it needs only the two aspect ratios, no pixels.
//
// Rendering and editing share these functions, so the point you click or drag
// is the point that is shown — the earlier CSS `object-position: fx% fy%` did
// neither (it aligned fx of the photo with fx of the cell, and clicks were taken
// in the cropped view but read as photo coordinates).

export type Focal = { x: number; y: number };

/** How many cells long the covering photo is, per axis (≥ 1; 1 = fits exactly) */
export function coverScale(imageAspect: number, cellAspect: number): { rx: number; ry: number } {
  if (!(imageAspect > 0) || !(cellAspect > 0)) return { rx: 1, ry: 1 };
  return { rx: Math.max(1, imageAspect / cellAspect), ry: Math.max(1, cellAspect / imageAspect) };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Photo offset along one axis (cell units, ≤ 0) that centres `f`, held at the edges */
export function axisOffset(f: number, r: number): number {
  return clamp(0.5 - f * r, 1 - r, 0);
}

/** The CSS object-position (percent per axis) that shows the photo at those offsets */
export function coverObjectPosition(focal: Focal | null, imageAspect: number, cellAspect: number): string {
  const { rx, ry } = coverScale(imageAspect, cellAspect);
  const f = focal ?? { x: 0.5, y: 0.5 };
  const pct = (off: number, r: number) => (r > 1 ? (off / (1 - r)) * 100 : 50);
  return `${pct(axisOffset(f.x, rx), rx)}% ${pct(axisOffset(f.y, ry), ry)}%`;
}

/** Where the focal point shows in the cell (0..1), for the marker */
export function focalInCell(focal: Focal | null, imageAspect: number, cellAspect: number): Focal {
  const { rx, ry } = coverScale(imageAspect, cellAspect);
  const f = focal ?? { x: 0.5, y: 0.5 };
  return { x: axisOffset(f.x, rx) + f.x * rx, y: axisOffset(f.y, ry) + f.y * ry };
}

/** The photo point under a click at (ux, uy) in the cell, given the current framing */
export function photoPointAt(ux: number, uy: number, focal: Focal | null, imageAspect: number, cellAspect: number): Focal {
  const { rx, ry } = coverScale(imageAspect, cellAspect);
  const f = focal ?? { x: 0.5, y: 0.5 };
  return {
    x: clamp((ux - axisOffset(f.x, rx)) / rx, 0, 1),
    y: clamp((uy - axisOffset(f.y, ry)) / ry, 0, 1),
  };
}

/**
 * The focal point after dragging the photo by (dx, dy) cell units from a start
 * framing. Moves only where the photo overflows; the result is the photo point
 * that sits in the cell's centre, so rendering it reproduces the dragged frame.
 */
export function focalAfterDrag(start: Focal | null, dx: number, dy: number, imageAspect: number, cellAspect: number): Focal {
  const { rx, ry } = coverScale(imageAspect, cellAspect);
  const f = start ?? { x: 0.5, y: 0.5 };
  const axis = (fv: number, d: number, r: number) => {
    if (r <= 1) return fv;
    const off = clamp(axisOffset(fv, r) + d, 1 - r, 0);
    return clamp((0.5 - off) / r, 0, 1);
  };
  return { x: axis(f.x, dx, rx), y: axis(f.y, dy, ry) };
}

/** Which way the photo can be dragged in its cell */
export function dragAxis(imageAspect: number, cellAspect: number): "x" | "y" | null {
  const { rx, ry } = coverScale(imageAspect, cellAspect);
  if (rx > 1.001) return "x";
  if (ry > 1.001) return "y";
  return null;
}
