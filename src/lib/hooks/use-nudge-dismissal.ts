"use client";

import { useCallback, useEffect, useState } from "react";

// Phase G Slice 9 / ADR-0006: curation nudge dismissal state.
// Stored in localStorage so cross-device dismissal isn't tracked — the user
// said cross-device matters less than the simplicity of avoiding a DB table.

const STORAGE_PREFIX = "pulseboard:era-nudge-dismissed:";

/** How long a dismissal suppresses the nudge before it returns. */
export const NUDGE_SUPPRESSION_DAYS = 7;

/** Minimum delta count on a draft Era before the nudge appears. */
export const NUDGE_THRESHOLD_DELTAS = 3;

function isFresh(timestampMs: number): boolean {
  const ageMs = Date.now() - timestampMs;
  const maxAgeMs = NUDGE_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000;
  return ageMs < maxAgeMs;
}

/** Whether the nudge for `eraId` is currently dismissed. SSR-safe (returns false on the server). */
export function isNudgeDismissed(eraId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + eraId);
    if (!raw) return false;
    const ts = Number.parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    return isFresh(ts);
  } catch {
    return false;
  }
}

/**
 * Count of nudge-eligible Eras for the badge surface: draft, ≥N deltas, not
 * currently dismissed. SSR-safe (returns 0 on the server). Lives client-side
 * because dismissal state is in localStorage.
 */
export function useDraftErasReadyCount(
  eras: { id: string; isBaseline: boolean; isDraft: boolean; scalarDeltas: { value: string }[] }[],
): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let n = 0;
    for (const era of eras) {
      if (era.isBaseline || !era.isDraft) continue;
      const populated = era.scalarDeltas.filter((d) => d.value.trim() !== "").length;
      if (populated < NUDGE_THRESHOLD_DELTAS) continue;
      if (isNudgeDismissed(era.id)) continue;
      n += 1;
    }
    setCount(n);
  }, [eras]);
  return count;
}

/**
 * React hook for the dismissal state of one Era's nudge. Returns `[dismissed, dismiss]`.
 * `dismissed` is `false` on the initial render to keep SSR + client in sync; the real
 * value lands after mount.
 */
export function useNudgeDismissal(eraId: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(isNudgeDismissed(eraId));
  }, [eraId]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + eraId, String(Date.now()));
    } catch {
      // Storage may be full or blocked — fall through to in-memory dismissal.
    }
    setDismissed(true);
  }, [eraId]);

  return [dismissed, dismiss];
}
