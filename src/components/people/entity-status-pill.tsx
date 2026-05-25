"use client";

import { cn } from "@/lib/utils";
import type { BodyMarkStatus, BodyModificationStatus } from "@/generated/prisma/client";

// Phase G Slice 12 / project_identity_bearing_ui: bold status indicator for
// the expanded entity view. Symbol + label, prominent at top-right, always
// visible (unlike the existing collapsed-row chip which hides when status
// is "present").

type Status = BodyMarkStatus | BodyModificationStatus;

const STYLE: Record<Status, { symbol: string; label: string; classes: string }> = {
  present:    { symbol: "●", label: "Present",    classes: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
  modified:   { symbol: "▲", label: "Modified",   classes: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300" },
  removed:    { symbol: "○", label: "Removed",    classes: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300" },
  overgrown:  { symbol: "◐", label: "Overgrown",  classes: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

export function EntityStatusPill({ status }: { status: Status }) {
  const style = STYLE[status];
  if (!style) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        style.classes,
      )}
      aria-label={`Status: ${style.label}`}
    >
      <span aria-hidden="true">{style.symbol}</span>
      {style.label}
    </span>
  );
}
