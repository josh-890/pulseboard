"use client";

import { cn } from "@/lib/utils";
import type { RelevanceLevel } from "@/lib/composer";

export type ComposerRelevanceCellProps = {
  own: RelevanceLevel | null;
  inherited: RelevanceLevel | null;
  /** "sitting × Seat" — for the screen reader */
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export const LEVEL_MARK: Record<RelevanceLevel, { mark: string; word: string; tone: string }> = {
  TYPICAL: { mark: "●", word: "typical", tone: "text-emerald-600 dark:text-emerald-400" },
  POSSIBLE: { mark: "○", word: "possible", tone: "text-sky-600 dark:text-sky-400" },
  IMPOSSIBLE: { mark: "✕", word: "hidden", tone: "text-rose-600 dark:text-rose-400" },
};

/** A matrix cell: its own level bold, an inherited one faint, nothing where the context has no say */
export function ComposerRelevanceCell({ own, inherited, label, onClick, disabled }: ComposerRelevanceCellProps) {
  const shown = own ?? inherited;
  const m = shown ? LEVEL_MARK[shown] : null;
  const state = own ? `${LEVEL_MARK[own].word} (set here)` : inherited ? `${LEVEL_MARK[inherited].word} (inherited)` : "no say";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${state} — click to change`}
      title={`${label}: ${state}`}
      data-testid="composer-relevance-cell"
      data-own={own ?? ""}
      data-inherited={inherited ?? ""}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-sm leading-none transition-colors duration-150",
        "hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30",
        m?.tone,
        own ? "font-bold" : "opacity-35",
      )}
    >
      {m?.mark ?? <span className="text-muted-foreground/40">·</span>}
    </button>
  );
}
