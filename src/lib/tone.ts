/**
 * Color or black & white — the client-safe half (ADR-0041). The measurement
 * lives in `image-tone.ts` (Sharp, server only).
 *
 * A set or session is one of three buckets, counted over its measured photos
 * (cover art and videos never count): color only, B&W only, or mixed — a single
 * photo of the other kind makes it mixed.
 */
export type ToneValue = "COLOR" | "MONO";

/** Calibrated 2026-11-20 on 1500 xpulse photos — see image-tone.ts */
export const TONE_THRESHOLD = 5;
export const TONE_BORDER: readonly [number, number] = [3, 7];

export function toneOf(chroma: number): ToneValue {
  return chroma < TONE_THRESHOLD ? "MONO" : "COLOR";
}

export function isBorderline(chroma: number): boolean {
  return chroma >= TONE_BORDER[0] && chroma <= TONE_BORDER[1];
}

export type ToneBucket = "color" | "mono" | "mixed";
export const TONE_BUCKETS: readonly ToneBucket[] = ["color", "mono", "mixed"];

export const TONE_BUCKET_LABEL: Record<ToneBucket, string> = {
  color: "Color",
  mono: "B&W",
  mixed: "Mixed",
};

export type ToneCounts = { mono: number; total: number };

export function toneBucketOf({ mono, total }: ToneCounts): ToneBucket | null {
  if (total === 0) return null;
  if (mono === 0) return "color";
  if (mono === total) return "mono";
  return "mixed";
}

export function isToneBucket(v: string): v is ToneBucket {
  return (TONE_BUCKETS as readonly string[]).includes(v);
}

export function parseToneBuckets(v: string | undefined | null): ToneBucket[] | undefined {
  if (!v) return undefined;
  const out = [...new Set(v.split(",").filter(isToneBucket))];
  return out.length > 0 ? out : undefined;
}

/** "12 of 96 B&W" — the badge's tooltip and accessible name */
export function toneCountsLabel({ mono, total }: ToneCounts): string {
  if (mono === total) return `All ${total} B&W`;
  return `${mono} of ${total} B&W`;
}
