"use client";

import { useState } from "react";
import type { SetIntensity } from "@/lib/services/intensity-service";
import { SessionIntensityPanel } from "./session-intensity-panel";
import type { SessionIntensityCatalog } from "./types";

export type SetIntensityPanelProps = {
  setId: string;
  intensity: SetIntensity;
  catalog: SessionIntensityCatalog;
};

// The intensity panel on a set (2026-10-24): the session's panel — what is
// ticked here is saved on the session, where the photos were made — in the
// set's light: values count only the acts the set shows, and a split session's
// acts can be left out of this set. A set from several sessions picks one.
export function SetIntensityPanel({ setId, intensity, catalog }: SetIntensityPanelProps) {
  const [sessionId, setSessionId] = useState(intensity.sessions[0]?.id ?? null);
  const session = intensity.sessions.find((s) => s.id === sessionId) ?? intensity.sessions[0];
  if (!session) {
    return <p className="text-muted-foreground text-sm">This set has no session yet — link one to record intensity.</p>;
  }
  return (
    <div className="space-y-2">
      {intensity.sessions.length > 1 && (
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          Session
          <select
            value={session.id}
            onChange={(e) => setSessionId(e.target.value)}
            aria-label="Session to record intensity on"
            className="bg-muted/30 focus:ring-ring h-7 min-w-0 flex-1 rounded-md border border-white/15 px-1.5 text-sm focus:ring-1 focus:outline-none"
          >
            {intensity.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <SessionIntensityPanel
        key={session.id}
        sessionId={session.id}
        contributions={session.contributions}
        catalog={catalog}
        hints={session.hints}
        release={{ setId, shared: session.shared, excluded: intensity.excluded, evidenceInSet: intensity.evidenceInSet }}
      />
    </div>
  );
}
