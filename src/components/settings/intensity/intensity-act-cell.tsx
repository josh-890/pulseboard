"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createIntensityActAction } from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity } from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityActRow } from "./intensity-act-row";
import { IntensityAddInput } from "./intensity-add-input";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityActCellProps = {
  scenario: { id: string; name: string };
  level: number;
  acts: IntensityCatalog["scenarios"][number]["acts"];
  showDescriptions: boolean;
};

// One cell: the scenario's acts on this level, and a way to add one right here.
export function IntensityActCell({ scenario, level, acts, showDescriptions }: IntensityActCellProps) {
  const { call } = useCatalogCall();
  const [adding, setAdding] = useState(false);

  return (
    <div role="cell" aria-label={`${scenario.name} at ${formatIntensity(level)}`} className="space-y-1">
      {acts.length > 0 && (
        <ul className="space-y-1">
          {acts.map((act) => (
            <IntensityActRow key={act.id} act={act} showDescription={showDescriptions} />
          ))}
        </ul>
      )}
      {adding ? (
        <IntensityAddInput
          autoFocus
          placeholder="Act name…"
          label={`Add an act to ${scenario.name} at ${formatIntensity(level)}`}
          onAdd={(name) => call(() => createIntensityActAction(scenario.id, name, level))}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={`New act in ${scenario.name} at ${formatIntensity(level)}`}
          className="flex h-5 w-full items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-white/5 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-70 [@media(hover:none)]:opacity-50"
        >
          <Plus size={11} aria-hidden="true" /> Act
        </button>
      )}
    </div>
  );
}
