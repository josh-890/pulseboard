"use client";

import { cn, splitOptionLabel } from "@/lib/utils";
import type { AttributeStatus } from "@/lib/types";
import { ATTRIBUTE_STATUS_DISPLAY } from "@/lib/constants/appearance";

type AttributeStatusProgressionProps = {
  baselineValue: string | null;
  currentValue: string;
  status: AttributeStatus;
  unit?: string | null;
  // Phase G Slice 6½ / ADR-0007 amendment: if the underlying attribute is
  // not status-bearing, render plain value regardless of the derived status.
  // The cause column on the delta is still valid data; this gate just hides
  // the status semantics from the UI where they wouldn't make sense
  // ("Enhanced Weight" being the canonical bad case). Defaults to true so
  // existing callers behave as before.
  statusBearing?: boolean;
};

// Pattern Y rendering per ADR-0007 / ADR-0018.
//   NATURAL                               → plain value, no badge.
//   non-NATURAL, distinct values          → full progression `B (Natural) → D (Enhanced)`
//                                            / `D (Natural) → B (Reduced)`.
//   non-NATURAL, equal values             → plain value + status badge ("D · Enhanced").
//     (covers cases like a breast lift / implant replacement that didn't
//     change the cup size — surgery still happened, status still applies,
//     but there's no progression arrow to draw.)
//   statusBearing === false               → plain value, ignore status entirely.
//   Labels + tints come from ATTRIBUTE_STATUS_DISPLAY (constants/appearance).
export function AttributeStatusProgression({
  baselineValue,
  currentValue,
  status,
  unit,
  statusBearing = true,
}: AttributeStatusProgressionProps) {
  // Strip trailing-parens helper text from SINGLE_SELECT values for compact
  // read-only display (e.g. "Pixie / Ear-length (ear / jawline)" → "Pixie /
  // Ear-length"). No-op for values without parens.
  const fmt = (v: string) => {
    const { label } = splitOptionLabel(v);
    return unit ? `${label} ${unit}` : label;
  };

  if (!statusBearing || status === "NATURAL") {
    return <span>{fmt(currentValue)}</span>;
  }

  const { label: currentLabel, tint: currentTint } = ATTRIBUTE_STATUS_DISPLAY[status];

  // Status applies but no distinct baseline → render value + badge only.
  const showProgression = baselineValue && baselineValue !== currentValue;
  if (!showProgression) {
    return (
      <span className="inline-flex items-baseline gap-1.5 align-middle">
        <span>{fmt(currentValue)}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            currentTint,
          )}
        >
          {currentLabel}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-flex items-baseline gap-1">
        <span>{fmt(baselineValue)}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Natural
        </span>
      </span>
      <span className="text-muted-foreground/60">→</span>
      <span className="inline-flex items-baseline gap-1">
        <span>{fmt(currentValue)}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            currentTint,
          )}
        >
          {currentLabel}
        </span>
      </span>
    </span>
  );
}
