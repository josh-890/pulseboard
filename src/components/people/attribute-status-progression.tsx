"use client";

import { cn } from "@/lib/utils";
import type { AttributeStatus } from "@/lib/types";

type AttributeStatusProgressionProps = {
  baselineValue: string | null;
  currentValue: string;
  status: AttributeStatus;
  unit?: string | null;
};

// Pattern Y rendering per ADR-0007.
//   NATURAL                            → plain value, no badge.
//   ENHANCED/RESTORED, distinct values → full progression `B (Natural) → D (Enhanced)`.
//   ENHANCED/RESTORED, equal values    → plain value + status badge ("D · Enhanced").
//     (covers cases like a breast lift / implant replacement that didn't
//     change the cup size — surgery still happened, status still applies,
//     but there's no progression arrow to draw.)
export function AttributeStatusProgression({
  baselineValue,
  currentValue,
  status,
  unit,
}: AttributeStatusProgressionProps) {
  const fmt = (v: string) => (unit ? `${v} ${unit}` : v);

  if (status === "NATURAL") {
    return <span>{fmt(currentValue)}</span>;
  }

  const currentLabel = status === "ENHANCED" ? "Enhanced" : "Restored";
  const currentTint =
    status === "ENHANCED"
      ? "bg-purple-500/15 text-purple-400"
      : "bg-emerald-500/15 text-emerald-400";

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
