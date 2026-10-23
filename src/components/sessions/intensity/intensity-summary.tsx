"use client";

import { useMemo } from "react";
import { IntensityValue } from "@/components/intensity/intensity-value";
import type { SessionIntensity } from "@/lib/services/intensity-service";
import { initialPanelState, personView } from "./panel-state";
import { IntensityPanelToggle } from "./intensity-panel-toggle";
import type { SessionIntensityCatalog } from "./types";

export type IntensitySummaryProps = {
  contributions: SessionIntensity;
  catalog: SessionIntensityCatalog;
};

// In the sidebar while the panel is closed: each person's intensity here, and
// the way to open the panel beside the photos.
export function IntensitySummary({ contributions, catalog }: IntensitySummaryProps) {
  const acts = useMemo(
    () => new Map(catalog.scenarios.flatMap((s) => s.acts.map((a) => [a.id, { level: a.level, name: a.name }] as const))),
    [catalog.scenarios],
  );
  const state = initialPanelState(contributions);
  return (
    <div className="space-y-2">
      {contributions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one on camera yet.</p>
      ) : (
        <ul className="space-y-1">
          {contributions.map((c) => {
            const v = personView(state[c.id]!, catalog, acts);
            return (
              <li key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {c.person.name} <span className="text-xs text-muted-foreground">({c.person.icgId})</span>
                </span>
                <IntensityValue value={v.total} max={catalog.max} className="shrink-0" />
              </li>
            );
          })}
        </ul>
      )}
      <IntensityPanelToggle className="w-full justify-center" />
    </div>
  );
}
