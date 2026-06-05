/**
 * 2D similarity transform (uniform scale + rotation + translation, no shear/reflection)
 * fitting source points to destination points by least squares (Umeyama, 2D).
 *
 * Used by the Motif Aligner: the user clicks keypoints on a source photo (`src`),
 * and the template defines where those points must land in the output frame (`dst`,
 * in output pixels). The resulting matrix maps source pixels → output pixels and is
 * fed to canvas `setTransform` to bake a consistently-framed image.
 *
 * Exact for 2 point pairs; least-squares for 3+.
 */

export type Pt = { x: number; y: number };

/**
 * Canvas `setTransform(a, b, c, d, e, f)` convention:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 * For a similarity: a = d = s·cosθ, b = s·sinθ, c = −s·sinθ.
 */
export type AffineMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export type SimilarityFit = {
  matrix: AffineMatrix;
  /** Uniform scale factor (output px per source px). >1 means the source is being enlarged. */
  scale: number;
  rotationDeg: number;
};

function centroid(pts: Pt[], n: number): Pt {
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += pts[i].x;
    y += pts[i].y;
  }
  return { x: x / n, y: y / n };
}

export function computeSimilarityTransform(src: Pt[], dst: Pt[]): SimilarityFit {
  const n = Math.min(src.length, dst.length);
  if (n < 2) throw new Error("computeSimilarityTransform requires at least 2 point pairs");

  const ca = centroid(src, n);
  const cb = centroid(dst, n);

  // Sums over centered points: dot (a·b), cross (a×b), and source variance.
  let dot = 0;
  let cross = 0;
  let srcSq = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i].x - ca.x;
    const ay = src[i].y - ca.y;
    const bx = dst[i].x - cb.x;
    const by = dst[i].y - cb.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    srcSq += ax * ax + ay * ay;
  }
  if (srcSq === 0) throw new Error("computeSimilarityTransform: source points are coincident");

  const sCos = dot / srcSq; // s·cosθ
  const sSin = cross / srcSq; // s·sinθ

  const a = sCos;
  const b = sSin;
  const c = -sSin;
  const d = sCos;
  const e = cb.x - (a * ca.x + c * ca.y);
  const f = cb.y - (b * ca.x + d * ca.y);

  return {
    matrix: { a, b, c, d, e, f },
    scale: Math.hypot(sCos, sSin),
    rotationDeg: (Math.atan2(sSin, sCos) * 180) / Math.PI,
  };
}

/** Apply an affine matrix (canvas convention) to a point. */
export function applyAffine(m: AffineMatrix, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}
