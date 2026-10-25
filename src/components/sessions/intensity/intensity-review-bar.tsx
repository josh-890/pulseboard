"use client";

import { Check, RotateCcw } from "lucide-react";
import type { IntensityReview } from "@/lib/intensity";

export type IntensityReviewBarProps = {
  /** The selected models with where each stands */
  people: { label: string; review: IntensityReview }[];
  onConfirm: () => void;
  onReopen: () => void;
};

// Confirming that the selected models' intensity was checked (2026-10-24) —
// after a preset, a copy or by hand. "Nothing to rate" is a valid answer: a
// model with no acts can be confirmed too.
export function IntensityReviewBar({ people, onConfirm, onReopen }: IntensityReviewBarProps) {
  const open = people.filter((p) => p.review !== "done");
  const who = people.length === 1 ? people[0]!.label : `${people.length} people`;

  if (open.length === 0) {
    return (
      <div className="flex min-h-7 items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs">
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
          <Check size={12} aria-hidden="true" /> Confirmed{people.length > 1 ? " — all selected" : ""}
        </span>
        <button
          type="button"
          onClick={onReopen}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw size={10} aria-hidden="true" /> Review again
        </button>
      </div>
    );
  }

  const unrated = open.every((p) => p.review === "unrated");
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs">
      <span className="min-w-0 truncate text-amber-800 dark:text-amber-200">
        {unrated
          ? "Not rated yet"
          : people.length === 1
            ? "To review — check the ticks against the photos"
            : `${open.length} of ${people.length} to review`}
      </span>
      <button
        type="button"
        onClick={onConfirm}
        aria-label={`Confirm the intensity of ${who}`}
        title={unrated ? "Nothing to rate — confirm with no acts" : "Checked — confirm (⏎ while the panel has focus)"}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:text-emerald-300"
      >
        <Check size={12} aria-hidden="true" /> Confirm
        <kbd className="ml-0.5 font-mono text-[10px] text-muted-foreground" aria-hidden="true">
          ⏎
        </kbd>
      </button>
    </div>
  );
}
