"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { setActsEvidenceAction } from "@/lib/actions/intensity-actions";
import type { EvidenceAct, EvidenceState } from "./act-evidence-list";

/** What a session gallery knows of intensity: the ticked acts, and per photo the acts it is evidence for */
export type GalleryIntensity = {
  acts: EvidenceAct[];
  /** Photo id → ContributionAct ids */
  evidence: Record<string, string[]>;
};

// A gallery's evidence links (ADR-0036, 3b): shown at once, saved behind. The
// server's copy wins whenever it changes (a save here, or the panel's picker).
export function useActEvidence(intensity: GalleryIntensity | undefined) {
  const server = intensity?.evidence;
  const [seen, setSeen] = useState(server);
  const [evidence, setEvidence] = useState<Record<string, string[]>>(server ?? {});
  const [, startTransition] = useTransition();
  if (seen !== server) {
    setSeen(server);
    setEvidence(server ?? {});
  }

  const stateOf = useCallback(
    (contributionActId: string, mediaIds: string[]): EvidenceState => {
      const n = mediaIds.filter((m) => evidence[m]?.includes(contributionActId)).length;
      return n === 0 ? "none" : n === mediaIds.length ? "all" : "some";
    },
    [evidence],
  );

  const toggle = useCallback((contributionActId: string, mediaIds: string[], linked: boolean) => {
    setEvidence((prev) => {
      const next = { ...prev };
      for (const m of mediaIds) {
        const has = (next[m] ?? []).filter((id) => id !== contributionActId);
        next[m] = linked ? [...has, contributionActId] : has;
      }
      return next;
    });
    startTransition(async () => {
      const result = await setActsEvidenceAction([contributionActId], mediaIds, linked);
      if (!result.success) {
        toast.error(result.error ?? "Could not save");
        setEvidence(server ?? {});
      }
    });
  }, [server]);

  return { acts: intensity?.acts ?? [], evidence, stateOf, toggle };
}
