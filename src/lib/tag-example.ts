// Tag examples (ADR-0042, S4) — the pure half: crops as fractions of the photo
// (0..1), kept at the tile's shape, and the CSS that shows a crop in a tile.
// Client-safe.

export type Crop = { x: number; y: number; w: number; h: number };

export type TagExampleThumb = { url: string; crop: Crop };

export const MAX_EXAMPLES = 5;

/** "3:4" → 0.75 (width / height); anything unreadable is square */
export function aspectOf(tileAspect: string): number {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(tileAspect.trim());
  if (!m) return 1;
  const r = Number(m[1]) / Number(m[2]);
  return r > 0 && Number.isFinite(r) ? r : 1;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The crop's height for a width, so the crop has the tile's shape in pixels:
 * (w·W)/(h·H) = tile  ⇒  h = w · (W/H) / tile.
 */
function heightFor(w: number, imageAspect: number, tileAspect: number): number {
  return (w * imageAspect) / tileAspect;
}

/** Keep a crop inside the photo, its shape fixed, at least 5 % wide */
export function fitCrop(c: Crop, imageAspect: number, tileAspect: number): Crop {
  let w = Math.max(0.05, Math.min(1, c.w));
  let h = heightFor(w, imageAspect, tileAspect);
  if (h > 1) {
    h = 1;
    w = (h * tileAspect) / imageAspect;
  }
  return { x: clamp01(Math.min(c.x, 1 - w)), y: clamp01(Math.min(c.y, 1 - h)), w, h };
}

/** The largest centred crop of the tile's shape — the starting point in the editor */
export function defaultCrop(imageAspect: number, tileAspect: number): Crop {
  const w = Math.min(1, tileAspect / imageAspect);
  const h = heightFor(w, imageAspect, tileAspect);
  return fitCrop({ x: (1 - w) / 2, y: Math.max(0, (1 - h) / 2), w, h }, imageAspect, tileAspect);
}

/** Drag the whole crop by a fraction of the photo */
export function moveCrop(c: Crop, dx: number, dy: number, imageAspect: number, tileAspect: number): Crop {
  return fitCrop({ ...c, x: c.x + dx, y: c.y + dy }, imageAspect, tileAspect);
}

/** Drag the bottom-right corner: the width follows, the height keeps the shape */
export function resizeCrop(c: Crop, dw: number, imageAspect: number, tileAspect: number): Crop {
  const maxW = Math.min(1 - c.x, ((1 - c.y) * tileAspect) / imageAspect);
  const w = Math.max(0.05, Math.min(maxW, c.w + dw));
  return { ...c, w, h: heightFor(w, imageAspect, tileAspect) };
}

/**
 * Position an image so the crop fills its box. The box must have the crop's
 * shape (the tile's), so both percentages hold at once.
 */
export function cropStyle(c: Crop): { width: string; height: string; left: string; top: string } {
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  return { width: pct(1 / c.w), height: pct(1 / c.h), left: pct(-c.x / c.w), top: pct(-c.y / c.h) };
}
