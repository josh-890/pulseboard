"use client";

import type { AttributeStatus } from "@/lib/types";
import { AttributeStatusProgression } from "@/components/people/attribute-status-progression";

type StaticLabelRowProps = {
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
  baselineValue?: string | null;
};

// Primitive for ALWAYS_STATIC scalar attributes (ADR-0005).
// Name + value only. No record-a-change affordance.
// Status (ENHANCED / RESTORED) is rendered via the Pattern Y progression
// (ADR-0007) — applies regardless of mutability policy.
export function StaticLabelRow({ name, value, unit, status, baselineValue }: StaticLabelRowProps) {
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{name}</dt>
      <dd className="text-sm text-foreground">
        <AttributeStatusProgression
          baselineValue={baselineValue ?? null}
          currentValue={value}
          status={status ?? "NATURAL"}
          unit={unit}
        />
      </dd>
    </div>
  );
}
