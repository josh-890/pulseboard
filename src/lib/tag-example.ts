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

/**
 * Position an image so the crop fills its box. The box must have the crop's
 * shape (the tile's), so both percentages hold at once.
 */
export function cropStyle(c: Crop): { width: string; height: string; left: string; top: string } {
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  return { width: pct(1 / c.w), height: pct(1 / c.h), left: pct(-c.x / c.w), top: pct(-c.y / c.h) };
}

// ─── Comparable examples: a box around the subject, a rule per path ─────────

/**
 * How a path frames its examples, so every tile of it compares: the subject
 * (the box the user draws around it) fills `fill` of the tile in its limiting
 * direction, centred — or, with `topMargin`, hung from the top (the head always
 * the same distance below the tile's edge, like a fashion shop's model line).
 */
export type Framing = { fill: number; topMargin?: number };

export const FRAMING: Record<string, Framing> = {
  Figure: { fill: 0.85, topMargin: 0.07 },
  Expression: { fill: 0.7 },
  Clothing: { fill: 0.85 },
  Camera: { fill: 0.85 },
};

export const DEFAULT_FRAMING: Framing = { fill: 0.85 };

/** A box around the subject, as fractions of the photo */
export type Box = Crop;

/**
 * The crop a subject box gets under a path's framing rule. Worked in a space
 * where the photo is `imageAspect` wide and 1 high; the crop keeps the tile's
 * shape. The scale always holds — that is what makes tiles compare. A crop that
 * fits in the photo is pushed back inside where it would cross an edge; one
 * larger than the photo in a direction (a lying person in a 3:4 tile) stays
 * centred on the subject, and the tile shows a neutral band there, like a mat.
 */
export function cropFromBox(box: Box, imageAspect: number, tileAspect: number, framing: Framing = DEFAULT_FRAMING): Crop {
  const A = imageAspect;
  const bw = Math.max(1e-3, box.w * A);
  const bh = Math.max(1e-3, box.h);
  const fill = Math.min(1, Math.max(0.1, framing.fill));
  const heightLimited = bh >= bw / tileAspect;
  const ch = Math.max(bh / fill, bw / fill / tileAspect);
  const cw = ch * tileAspect;
  const cx = (box.x + box.w / 2) * A;
  let x0 = cx - cw / 2;
  let y0 = heightLimited && framing.topMargin !== undefined ? box.y - framing.topMargin * ch : box.y + bh / 2 - ch / 2;
  if (cw <= A) x0 = Math.min(Math.max(0, x0), A - cw);
  if (ch <= 1) y0 = Math.min(Math.max(0, y0), 1 - ch);
  return { x: x0 / A, y: y0, w: cw / A, h: ch };
}

/** A box normalised from two corners in any order, kept inside the photo */
export function boxFromCorners(ax: number, ay: number, bx: number, by: number): Box {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const [x1, x2] = [c(Math.min(ax, bx)), c(Math.max(ax, bx))];
  const [y1, y2] = [c(Math.min(ay, by)), c(Math.max(ay, by))];
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
