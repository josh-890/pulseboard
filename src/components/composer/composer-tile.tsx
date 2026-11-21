"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerTag } from "@/lib/composer";
import type { PathStyle } from "./composer-path-style";

export type TileState = "on" | "proposed" | "implied" | "off";

export type ComposerTileProps = {
  tag: ComposerTag;
  state: TileState;
  style: PathStyle;
  /** Shift-click adds instead of replacing (base postures) */
  onToggle: (tagId: string, additive: boolean) => void;
  disabled?: boolean;
};

/**
 * A Composer tile (ADR-0042): the tag's name and its one-line definition.
 * Filled when held, dashed when carried over from the last photo, faint with a
 * tick when only implied by another tag. Example images arrive in S4; until a
 * tag has one, this text tile is the tile.
 */
export function ComposerTile({ tag, state, style, onToggle, disabled }: ComposerTileProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => onToggle(tag.id, e.shiftKey)}
      aria-pressed={state === "on" || state === "proposed"}
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
      )}
    >
      <span
        className={cn(
          "flex w-full items-center gap-1 text-xs font-medium",
          state === "on" || state === "proposed" ? style.text : state === "implied" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{tag.name}</span>
        {(state === "on" || state === "implied") && <Check size={12} aria-hidden className="shrink-0" />}
      </span>
      {tag.description && <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{tag.description}</span>}
      {state === "implied" && <span className="sr-only">implied</span>}
      {state === "proposed" && <span className="sr-only">carried over from the last photo</span>}
    </button>
  );
}
