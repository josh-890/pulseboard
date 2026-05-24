"use client";

import { Plus } from "lucide-react";
import type { AttributeStatus } from "@/lib/types";
import { AttributeStatusProgression } from "@/components/people/attribute-status-progression";

type ValueWithChangeRowProps = {
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
  baselineValue?: string | null;
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
  baselineValue,
  onRecordChange,
}: ValueWithChangeRowProps) {
  return (
    <div className="group/row flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{name}</dt>
      <dd className="flex-1 text-sm text-foreground">
        <AttributeStatusProgression
          baselineValue={baselineValue ?? null}
          currentValue={value}
          status={status ?? "NATURAL"}
          unit={unit}
        />
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
