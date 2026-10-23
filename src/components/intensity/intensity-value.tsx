import { formatIntensity, intensityColor, intensityTextColor } from "@/lib/intensity";
import { cn } from "@/lib/utils";

export type IntensityValueProps = {
  /** The value, or null for "nothing ticked" (a dash) */
  value: number | null;
  /** The top of the tenant's scale — the colour runs from 0 to it */
  max: number;
  className?: string;
};

// An intensity value as a pill in its heat colour (green → violet, 0 → Max,
// 2026-10-23) — the same number has the same colour everywhere. Every pill has
// the same width (in em, so it grows with the text) whatever the number — "5"
// and "11.5" make the same patch of colour. The colour is a style: it is
// computed from the value, not one of a few classes.
export function IntensityValue({ value, max, className }: IntensityValueProps) {
  if (value === null) {
    return <span className={cn("text-muted-foreground tabular-nums", className)}>—</span>;
  }
  return (
    <span
      className={cn("inline-flex w-[2.9em] justify-center rounded-md font-semibold tabular-nums", className)}
      style={{ backgroundColor: intensityColor(value, max), color: intensityTextColor(value, max) }}
    >
      {formatIntensity(value)}
    </span>
  );
}
