"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { AttributeStatus } from "@/lib/types";
import { AttributeStatusProgression } from "@/components/people/attribute-status-progression";
import { StaticAttributeEditor, type StaticAttributeEditData } from "@/components/people/static-attribute-editor";
import { cn } from "@/lib/utils";

type StaticLabelRowProps = {
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
  baselineValue?: string | null;
  statusBearing?: boolean;
  /** In-place edit of the baseline; without it the row is display only */
  edit?: StaticAttributeEditData;
};

// Primitive for ALWAYS_STATIC scalar attributes (ADR-0005).
// Name + value, no record-a-change affordance: a pencil edits the value in
// place, as always true (baseline) — 2026-10-20.
// Status (ENHANCED / RESTORED) is rendered via the Pattern Y progression
// (ADR-0007) — applies regardless of mutability policy, but only when the
// attribute is status-bearing (ADR-0007 amendment).
export function StaticLabelRow({ name, value, unit, status, baselineValue, statusBearing, edit }: StaticLabelRowProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={cn("group/row rounded-lg bg-muted/20 px-2.5 py-1.5", editing && "sm:col-span-2")}>
      <div className="flex items-start gap-2">
        <dt className="w-28 shrink-0 text-xs text-muted-foreground">{name}</dt>
        <dd className="flex-1 text-sm text-foreground">
          <AttributeStatusProgression
            baselineValue={baselineValue ?? null}
            currentValue={value}
            status={status ?? "NATURAL"}
            unit={unit}
            statusBearing={statusBearing}
          />
        </dd>
        {edit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 [@media(pointer:coarse)]:opacity-100"
            aria-label={`Edit ${name}`}
            title={`Edit ${name}`}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {edit && editing && <StaticAttributeEditor {...edit} currentValue={value} onClose={() => setEditing(false)} />}
    </div>
  );
}
