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
