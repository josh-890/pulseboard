"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttributeStatus } from "@/lib/types";

type ValueWithChangeRowProps = {
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
  onRecordChange?: () => void;
};

// Primitive for RARELY_CHANGES scalar attributes (ADR-0005).
// Inline display plus a quiet secondary "+ change" affordance.
// Use for attributes that drift over time but don't lead with the change
// action — build, face shape, hair pattern, inseam, etc.
export function ValueWithChangeRow({
  name,
  value,
  unit,
  status,
  onRecordChange,
}: ValueWithChangeRowProps) {
  const displayValue = unit ? `${value} ${unit}` : value;
  return (
    <div className="group/row flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{name}</dt>
      <dd className="flex-1 text-sm text-foreground">
        {displayValue}
        {status && status !== "NATURAL" && (
          <span
            className={cn(
              "ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
              status === "ENHANCED" && "bg-purple-500/20 text-purple-400",
              status === "RESTORED" && "bg-emerald-500/20 text-emerald-400",
            )}
          >
            {status === "ENHANCED" ? "Enhanced" : "Restored"}
          </span>
        )}
      </dd>
      {onRecordChange && (
        <button
          type="button"
          onClick={onRecordChange}
          className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/row:opacity-100"
          aria-label={`Record change for ${name}`}
        >
          <Plus size={10} />
          change
        </button>
      )}
    </div>
  );
}
