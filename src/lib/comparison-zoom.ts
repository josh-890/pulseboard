// Zoom state for the comparison viewer, in units of the zoomed frame — a cell
// (synchronized zoom: the same state on every cell) or the whole row (zoom as
// one image). A content point v (0..1) shows at u = t + s·v, so the state maps
// straight onto CSS: `translate(t·100%) scale(s)` with transform-origin 0 0.

export type ZoomState = { scale: number; tx: number; ty: number };

export const ZOOM_RESET: ZoomState = { scale: 1, tx: 0, ty: 0 };

/** Scale a click zooms to */
export const CLICK_ZOOM = 2.5;
export const MAX_ZOOM = 6;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Keep the content covering the frame: no empty edge shows while zoomed */
export function clampZoom(z: ZoomState): ZoomState {
  const scale = clamp(z.scale, 1, MAX_ZOOM);
  if (scale === 1) return ZOOM_RESET;
  return { scale, tx: clamp(z.tx, 1 - scale, 0), ty: clamp(z.ty, 1 - scale, 0) };
}

/** Zoom to `scale` keeping the content under the frame point (ux, uy) in place */
export function zoomAt(z: ZoomState, ux: number, uy: number, scale: number): ZoomState {
  const vx = (ux - z.tx) / z.scale;
  const vy = (uy - z.ty) / z.scale;
  return clampZoom({ scale, tx: ux - scale * vx, ty: uy - scale * vy });
}

/** Pan by a distance in frame units (a drag of the whole frame width = 1) */
export function panBy(z: ZoomState, dx: number, dy: number): ZoomState {
  return clampZoom({ scale: z.scale, tx: z.tx + dx, ty: z.ty + dy });
}

/** A click: zoom in at the point, or back out when already zoomed */
export function toggleZoomAt(z: ZoomState, ux: number, uy: number): ZoomState {
  return z.scale > 1 ? ZOOM_RESET : zoomAt(z, ux, uy, CLICK_ZOOM);
}

export function zoomTransform(z: ZoomState): string {
  return `translate(${z.tx * 100}%, ${z.ty * 100}%) scale(${z.scale})`;
}
