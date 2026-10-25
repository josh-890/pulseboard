"use client";

import { Check, RotateCcw } from "lucide-react";
import type { IntensityReview } from "@/lib/intensity";

export type IntensityReviewBarProps = {
  /** The selected models with where each stands */
  people: { label: string; review: IntensityReview }[];
  onConfirm: () => void;
  onReopen: () => void;
  /** In the rating queue: confirm everyone in the session and go on (⏎) */
  onConfirmNext?: () => void;
};

// Confirming that the selected models' intensity was checked (2026-10-24) —
// after a preset, a copy or by hand. "Nothing to rate" is a valid answer: a
// model with no acts can be confirmed too.
export function IntensityReviewBar({
  people,
  onConfirm,
  onReopen,
  onConfirmNext,
}: IntensityReviewBarProps) {
  const open = people.filter((p) => p.review !== "done");
  const who =
    people.length === 1 ? people[0]!.label : `${people.length} people`;

  const next = onConfirmNext && (
    <button
      type="button"
      onClick={onConfirmNext}
      title="Confirm everyone in this session and go to the next (⏎ while the panel has focus)"
      className="focus-visible:ring-ring inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 font-medium text-white hover:bg-emerald-700 focus-visible:ring-1 focus-visible:outline-none"
    >
      <Check size={12} aria-hidden="true" /> Confirm all &amp; next
      <kbd
        className="ml-0.5 font-mono text-[10px] text-white/70"
        aria-hidden="true"
      >
        ⏎
      </kbd>
    </button>
  );

  if (open.length === 0) {
    return (
      <div className="flex min-h-7 items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs">
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
          <Check size={12} aria-hidden="true" /> Confirmed
          {people.length > 1 ? " — all selected" : ""}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReopen}
            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
          >
            <RotateCcw size={10} aria-hidden="true" /> Review again
          </button>
          {next}
        </span>
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
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onConfirm}
          aria-label={`Confirm the intensity of ${who}`}
          title={
            unrated
              ? "Nothing to rate — confirm with no acts"
              : onConfirmNext
                ? "Checked — confirm the selected"
                : "Checked — confirm (⏎ while the panel has focus)"
          }
          className="focus-visible:ring-ring inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-500/15 focus-visible:ring-1 focus-visible:outline-none dark:text-emerald-300"
        >
          <Check size={12} aria-hidden="true" /> Confirm
          {!onConfirmNext && (
            <kbd
              className="text-muted-foreground ml-0.5 font-mono text-[10px]"
              aria-hidden="true"
            >
              ⏎
            </kbd>
          )}
        </button>
        {next}
      </span>
    </div>
  );
}
