/**
 * Pure bake geometry shared by the Motif Aligner and the archive HD re-bake agent
 * (ADR-0017). Given a template + the source keypoints (0..1 fractions) + the source
 * pixel dimensions, produce the output (bake) size and the canvas `setTransform`
 * matrix that maps source pixels → output pixels. Resolution-independent: the same
 * fractions produce the correct matrix for the master OR the full-res original.
 */
import { computeSimilarityTransform, type AffineMatrix, type Pt } from "./similarity-transform";

export type TemplateKeypoint = { name: string; x: number; y: number };

/** Output frame size from the template aspect + long side (mirrors motif-aligner). */
export function bakeDimensions(
  aspectW: number,
  aspectH: number,
  bakeLongSide: number,
): { bakeW: number; bakeH: number } {
  const portrait = aspectH >= aspectW;
  return portrait
    ? { bakeW: Math.round((bakeLongSide * aspectW) / aspectH), bakeH: bakeLongSide }
    : { bakeW: bakeLongSide, bakeH: Math.round((bakeLongSide * aspectH) / aspectW) };
}

/** Coerce a template's JSON keypoints into the ordered {name,x,y} list. */
export function parseTemplateKeypoints(raw: unknown): TemplateKeypoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((k) =>
    k && typeof k === "object" && typeof (k as TemplateKeypoint).name === "string"
      ? [{ name: String((k as TemplateKeypoint).name), x: Number((k as TemplateKeypoint).x), y: Number((k as TemplateKeypoint).y) }]
      : [],
  );
}

/**
 * The source→output `setTransform` matrix for a bake. `keypoints` are 0..1 source
 * fractions keyed by template keypoint name; `srcW`/`srcH` are the source image's
 * pixel dimensions (the master for the original bake, the full-res original for an
 * HD re-bake). Returns null if a template keypoint has no matching source fraction.
 */
export function computeBakeMatrix(
  templateKeypoints: TemplateKeypoint[],
  keypoints: Record<string, { x: number; y: number }>,
  srcW: number,
  srcH: number,
  bakeW: number,
  bakeH: number,
): AffineMatrix | null {
  const src: Pt[] = [];
  const dst: Pt[] = [];
  for (const tk of templateKeypoints) {
    const f = keypoints[tk.name];
    if (!f) return null;
    src.push({ x: f.x * srcW, y: f.y * srcH });
    dst.push({ x: tk.x * bakeW, y: tk.y * bakeH });
  }
  if (src.length < 2) return null;
  return computeSimilarityTransform(src, dst).matrix;
}

export type SourceRect = { x: number; y: number; w: number; h: number };

/**
 * The sub-rectangle of the source that actually lands inside the bake canvas.
 *
 * A bake typically crops hard into a locus, so most of the source is transformed
 * and then thrown away by the clip. Renderers are not all smart about that: GDI+
 * with HighQualityBicubic degrades catastrophically when handed a 47-megapixel
 * source for a 1365x2048 output, to the point of appearing to hang. Restricting
 * the draw to this rect is exact — everything outside it is clipped anyway — and
 * on real archive originals cuts the work by 2-14x.
 *
 * Derived by mapping the four output corners back through the inverse matrix and
 * taking the bounding box, padded so edge pixels still have the neighbours the
 * interpolation kernel samples. Returns the full image when the matrix is
 * singular or the result would be degenerate.
 */
export function visibleSourceRect(
  m: AffineMatrix,
  bakeW: number,
  bakeH: number,
  srcW: number,
  srcH: number,
): SourceRect {
  const whole: SourceRect = { x: 0, y: 0, w: srcW, h: srcH };
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || det === 0) return whole;

  // Inverse of [a c e; b d f] in canvas convention.
  const invA = m.d / det;
  const invB = -m.b / det;
  const invC = -m.c / det;
  const invD = m.a / det;
  const invE = (m.c * m.f - m.d * m.e) / det;
  const invF = (m.b * m.e - m.a * m.f) / det;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [X, Y] of [[0, 0], [bakeW, 0], [0, bakeH], [bakeW, bakeH]]) {
    const x = invA * X + invC * Y + invE;
    const y = invB * X + invD * Y + invF;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return whole;

  // Kernel margin, in SOURCE pixels: when the bake downscales, one output pixel
  // samples several source pixels, so the padding has to grow accordingly.
  const scale = Math.hypot(m.a, m.b);
  const margin = Math.ceil(4 / Math.min(1, scale || 1)) + 4;

  const cx0 = Math.max(0, Math.floor(x0) - margin);
  const cy0 = Math.max(0, Math.floor(y0) - margin);
  const cx1 = Math.min(srcW, Math.ceil(x1) + margin);
  const cy1 = Math.min(srcH, Math.ceil(y1) + margin);
  const w = cx1 - cx0;
  const h = cy1 - cy0;
  if (w <= 0 || h <= 0) return whole;
  return { x: cx0, y: cy0, w, h };
}
