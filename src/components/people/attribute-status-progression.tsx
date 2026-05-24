"use client";

import { cn } from "@/lib/utils";
import type { AttributeStatus } from "@/lib/types";

type AttributeStatusProgressionProps = {
  baselineValue: string | null;
  currentValue: string;
  status: AttributeStatus;
  unit?: string | null;
};

// Pattern Y rendering per ADR-0007: for ENHANCED / RESTORED attributes, show
// the progression `B (Natural) → D (Enhanced)` so the original natural value is
// always visible alongside the current one. NATURAL renders as plain value
// (no badge, no progression) — the absence of decoration IS the signal.
//
// Falls back to plain `currentValue` if baseline is unknown (no historical
// reference to show) — defensive for partial data.
export function AttributeStatusProgression({
  baselineValue,
  currentValue,
  status,
  unit,
}: AttributeStatusProgressionProps) {
  const fmt = (v: string) => (unit ? `${v} ${unit}` : v);

  if (status === "NATURAL" || !baselineValue || baselineValue === currentValue) {
    return <span>{fmt(currentValue)}</span>;
  }

  const baselineLabel = "Natural";
  const currentLabel = status === "ENHANCED" ? "Enhanced" : "Restored";
  const currentTint =
    status === "ENHANCED"
      ? "bg-purple-500/15 text-purple-400"
      : "bg-emerald-500/15 text-emerald-400";

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-flex items-baseline gap-1">
        <span>{fmt(baselineValue)}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {baselineLabel}
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
