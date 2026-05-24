"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttributeStatus } from "@/lib/types";

type ValueWithSparklineRowProps = {
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
  onRecordChange?: () => void;
};

// Primitive for VOLATILE scalar attributes (ADR-0005).
// Current value rendered with slightly more visual weight, and the
// record-a-change action is the primary affordance (not hidden on hover).
// A trend visualization (sparkline for numeric / sequence-of-pills for
// categorical) belongs here too — deferred to a follow-up slice because the
// per-attribute history isn't plumbed into the cache shape yet.
export function ValueWithSparklineRow({
  name,
  value,
  unit,
  status,
  onRecordChange,
}: ValueWithSparklineRowProps) {
  const displayValue = unit ? `${value} ${unit}` : value;
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{name}</dt>
      <dd className="flex-1 text-sm font-medium text-foreground">
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
          className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
          aria-label={`Record change for ${name}`}
        >
          <Plus size={11} />
          Record change
        </button>
      )}
    </div>
  );
}
