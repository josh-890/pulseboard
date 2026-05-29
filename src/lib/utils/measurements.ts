// Slice 16 follow-up: 3-state Measurements composition for the person hero.
//
// Order: structured Bust-Waist-Hips (cm) when all three are present →
// raw TEXT measurements (the import pass-through) → null.
// The structured format is "{bust}-{waist}-{hips}" (Bust-Waist-Hips, the
// standard order; the user's example was 88-62-90).

type Numeric = number | string | null | undefined;

function toNumber(v: Numeric): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(n: number): string {
  // Whole numbers render as integers; decimals to 1 place. Body measurements
  // are nearly always whole cm in our data, so this keeps the display crisp.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatMeasurements({
  bust,
  waist,
  hips,
  textFallback,
}: {
  bust: Numeric;
  waist: Numeric;
  hips: Numeric;
  textFallback: string | null | undefined;
}): string | null {
  const b = toNumber(bust);
  const w = toNumber(waist);
  const h = toNumber(hips);
  if (b != null && w != null && h != null) {
    return `${formatNumber(b)}-${formatNumber(w)}-${formatNumber(h)}`;
  }
  const text = textFallback?.trim();
  if (text) return text;
  return null;
}
