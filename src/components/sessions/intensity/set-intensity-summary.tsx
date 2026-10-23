"use client";

import Link from "next/link";
import type { SetIntensity } from "@/lib/services/intensity-service";
import { IntensitySummary } from "./intensity-summary";
import type { SessionIntensityCatalog } from "./types";

export type SetIntensitySummaryProps = {
  intensity: SetIntensity;
  catalog: SessionIntensityCatalog;
};

// In the set's sidebar while the panel is closed (2026-10-24): each person's
// intensity in this release — its session's, minus the acts it leaves out.
export function SetIntensitySummary({ intensity, catalog }: SetIntensitySummaryProps) {
  if (intensity.sessions.length === 0) {
    return <p className="text-muted-foreground text-sm">No session linked — intensity is recorded on a session.</p>;
  }
  return (
    <div className="space-y-3">
      {intensity.sessions.map((s) => (
        <div key={s.id} className="space-y-1">
          {intensity.sessions.length > 1 && (
            <Link href={`/sessions/${s.id}`} className="text-muted-foreground hover:text-foreground block truncate text-xs">
              {s.name}
            </Link>
          )}
          <IntensitySummary contributions={s.contributions} catalog={catalog} excluded={intensity.excluded} />
        </div>
      ))}
    </div>
  );
}
