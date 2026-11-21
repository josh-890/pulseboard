"use client";

import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerTag } from "@/lib/composer";
import type { PathStyle } from "./composer-path-style";

/**
 * One photo: on · proposed (carried over) · implied · off.
 * A selection or brush (S3): add · remove (the composition) · on (every photo
 * has it) · partial (some have it) · off.
 */
export type TileState = "on" | "proposed" | "implied" | "off" | "add" | "remove" | "partial";

export type ComposerTileProps = {
  tag: ComposerTag;
  state: TileState;
  style: PathStyle;
  /** Shift-click adds instead of replacing (base postures) */
  onToggle: (tagId: string, additive: boolean) => void;
  disabled?: boolean;
  /** On a selection: how many of the selected photos carry the tag */
  count?: { n: number; of: number };
  /** Pass mode: the key that picks it */
  shortcut?: string;
};

/**
 * A Composer tile (ADR-0042): the tag's name and its one-line definition.
 * Filled when held, dashed when carried over from the last photo, faint with a
 * tick when only implied by another tag. Example images arrive in S4; until a
 * tag has one, this text tile is the tile.
 */
export function ComposerTile({ tag, state, style, onToggle, disabled, count, shortcut }: ComposerTileProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => onToggle(tag.id, e.shiftKey)}
      aria-pressed={state === "on" || state === "proposed" || state === "add"}
      title={tag.description ? `${tag.name} — ${tag.description}` : tag.name}
      data-testid="composer-tile"
      data-tag={tag.name}
      data-state={state}
      className={cn(
        "relative flex min-h-[3.25rem] flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        state === "on" && cn(style.on, "shadow-sm"),
        state === "proposed" && cn("border-dashed", style.on),
        state === "implied" && "border-border/40 bg-muted/30",
        state === "off" && "border-border/50 bg-card/60 hover:border-border hover:bg-muted/50",
        state === "partial" && "border-border bg-muted/40 hover:bg-muted/60",
        state === "add" && "border-emerald-500/60 bg-emerald-500/15 shadow-sm",
        state === "remove" && "border-rose-500/60 bg-rose-500/10",
      )}
    >
      <span
        className={cn(
          "flex w-full items-center gap-1 text-xs font-medium",
          state === "on" || state === "proposed"
            ? style.text
            : state === "add"
              ? "text-emerald-700 dark:text-emerald-300"
              : state === "remove"
                ? "text-rose-700 line-through dark:text-rose-300"
                : state === "implied"
                  ? "text-muted-foreground"
                  : "text-foreground",
        )}
      >
        {shortcut && <kbd className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground no-underline">{shortcut}</kbd>}
        <span className="min-w-0 flex-1 truncate">{tag.name}</span>
        {state === "add" && <Plus size={12} aria-hidden className="shrink-0" />}
        {state === "remove" && <Minus size={12} aria-hidden className="shrink-0" />}
        {count && count.n > 0 && state !== "add" && state !== "remove" && (
          <span className="shrink-0 rounded-full bg-background/70 px-1 text-[9px] tabular-nums text-muted-foreground" data-testid="composer-tile-count">
            {count.n}/{count.of}
          </span>
        )}
        {(state === "on" || state === "implied") && !count && <Check size={12} aria-hidden className="shrink-0" />}
      </span>
      {tag.description && <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{tag.description}</span>}
      {state === "implied" && <span className="sr-only">implied</span>}
      {state === "proposed" && <span className="sr-only">carried over from the last photo</span>}
      {state === "add" && <span className="sr-only">will be added</span>}
      {state === "remove" && <span className="sr-only">will be removed</span>}
    </button>
  );
}
