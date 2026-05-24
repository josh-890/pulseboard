"use client";

import { cn } from "@/lib/utils";
import type { AttributeStatus } from "@/lib/types";

type StaticLabelRowProps = {
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
};

// Primitive for ALWAYS_STATIC scalar attributes (ADR-0005).
// Name + value only. No record-a-change affordance.
// Status badge still rendered if the value carries ENHANCED/RESTORED — that
// concern is orthogonal to mutability and applies regardless of policy level.
export function StaticLabelRow({ name, value, unit, status }: StaticLabelRowProps) {
  const displayValue = unit ? `${value} ${unit}` : value;
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{name}</dt>
      <dd className="text-sm text-foreground">
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
    </div>
  );
}
