"use client";

import type { Mutability } from "@/generated/prisma/client";
import type { AttributeStatus } from "@/lib/types";
import { StaticLabelRow } from "@/components/people/static-label-row";
import { ValueWithChangeRow } from "@/components/people/value-with-change-row";
import { ValueWithSparklineRow } from "@/components/people/value-with-sparkline-row";

type MutabilityPrimitiveProps = {
  mutability: Mutability;
  name: string;
  value: string;
  unit?: string | null;
  status?: AttributeStatus;
  baselineValue?: string | null;  // Phase G Slice 4 / ADR-0007: Pattern Y progression
  onRecordChange?: () => void;
};

// Deterministic switcher from mutability policy → visual primitive (ADR-0005).
// No per-attribute affordance override — if the rendering feels wrong, the
// fix is to reclassify the attribute in Settings, not to add escape hatches.
export function MutabilityPrimitive({
  mutability,
  name,
  value,
  unit,
  status,
  baselineValue,
  onRecordChange,
}: MutabilityPrimitiveProps) {
  switch (mutability) {
    case "ALWAYS_STATIC":
      return <StaticLabelRow name={name} value={value} unit={unit} status={status} baselineValue={baselineValue} />;
    case "RARELY_CHANGES":
      return (
        <ValueWithChangeRow
          name={name}
          value={value}
          unit={unit}
          status={status}
          baselineValue={baselineValue}
          onRecordChange={onRecordChange}
        />
      );
    case "VOLATILE":
      return (
        <ValueWithSparklineRow
          name={name}
          value={value}
          unit={unit}
          status={status}
          baselineValue={baselineValue}
          onRecordChange={onRecordChange}
        />
      );
  }
}
