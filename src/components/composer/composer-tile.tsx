"use client";

import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerTag } from "@/lib/composer";
import type { PathStyle } from "./composer-path-style";
import { CameraPictogram, hasCameraPictogram } from "./camera-pictogram";
import { TagCardPopover, tileAspectClass } from "./tag-card-popover";
import { TagExampleImage } from "./tag-example-image";

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
  /** Picture tile (S4): the example or pictogram on top, in the path's shape */
  visual?: boolean;
  tileAspect?: string;
};

/** A group shows picture tiles once any of its tags has an example or a pictogram */
export function wantsVisualTiles(tags: ComposerTag[]): boolean {
  return tags.some((t) => !!t.example || hasCameraPictogram(t.name));
}

/**
 * A Composer tile (ADR-0042): the tag's name and its definition — or, in a
 * picture grid, its example cropped to the path's shape (or a pictogram), the
 * name below. Filled when held, dashed when carried over from the last photo,
 * faint with a tick when only implied. Hover, long-press or ⓘ opens its card.
 */
export function ComposerTile({ tag, state, style, onToggle, disabled, count, shortcut, visual, tileAspect = "1:1" }: ComposerTileProps) {
  const nameClass = cn(
    state === "on" || state === "proposed"
      ? style.text
      : state === "add"
        ? "text-emerald-700 dark:text-emerald-300"
        : state === "remove"
          ? "text-rose-700 line-through dark:text-rose-300"
          : state === "implied"
            ? "text-muted-foreground"
            : "text-foreground",
  );
  const marks = (
    <>
      {state === "add" && <Plus size={12} aria-hidden className="shrink-0" />}
      {state === "remove" && <Minus size={12} aria-hidden className="shrink-0" />}
      {count && count.n > 0 && state !== "add" && state !== "remove" && (
        <span className="shrink-0 rounded-full bg-background/70 px-1 text-[9px] tabular-nums text-muted-foreground" data-testid="composer-tile-count">
          {count.n}/{count.of}
        </span>
      )}
      {(state === "on" || state === "implied") && !count && <Check size={12} aria-hidden className="shrink-0" />}
    </>
  );
  const frame = cn(
    "relative w-full rounded-lg border text-left transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
    state === "on" && cn(style.on, "shadow-sm"),
    state === "proposed" && cn("border-dashed", style.on),
    state === "implied" && "border-border/40 bg-muted/30",
    state === "off" && "border-border/50 bg-card/60 hover:border-border hover:bg-muted/50",
    state === "partial" && "border-border bg-muted/40 hover:bg-muted/60",
    state === "add" && "border-emerald-500/60 bg-emerald-500/15 shadow-sm",
    state === "remove" && "border-rose-500/60 bg-rose-500/10",
  );

  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => onToggle(tag.id, e.shiftKey)}
      aria-pressed={state === "on" || state === "proposed" || state === "add"}
      title={tag.description ? `${tag.name} — ${tag.description}` : tag.name}
      data-testid="composer-tile"
      data-tag={tag.name}
      data-state={state}
      data-visual={visual ? "true" : undefined}
      className={cn(frame, visual ? "flex flex-col overflow-hidden p-0" : "flex min-h-[3.25rem] flex-col items-start gap-0.5 px-2 py-1.5")}
    >
      {visual ? (
        <>
          <span
            className={cn(
              tileAspectClass(tileAspect),
              "block w-full overflow-hidden",
              (state === "implied" || state === "remove") && "opacity-50",
            )}
          >
            {tag.example ? (
              <TagExampleImage url={tag.example.url} crop={tag.example.crop} className="h-full w-full" />
            ) : hasCameraPictogram(tag.name) ? (
              <span className={cn("flex h-full w-full items-center justify-center bg-muted/40 p-2", nameClass)}>
                <CameraPictogram tagName={tag.name} className="h-full w-full max-w-[4.5rem]" />
              </span>
            ) : (
              <span className="flex h-full w-full items-center bg-muted/30 p-1.5 text-[10px] leading-snug text-muted-foreground">
                <span className="line-clamp-4">{tag.description ?? tag.name}</span>
              </span>
            )}
          </span>
          <span className={cn("flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-medium", nameClass)}>
            {shortcut && <kbd className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground no-underline">{shortcut}</kbd>}
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            {marks}
          </span>
        </>
      ) : (
        <>
          <span className={cn("flex w-full items-center gap-1 text-xs font-medium", nameClass)}>
            {shortcut && <kbd className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground no-underline">{shortcut}</kbd>}
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            {marks}
          </span>
          {tag.description && <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{tag.description}</span>}
        </>
      )}
      {state === "implied" && <span className="sr-only">implied</span>}
      {state === "proposed" && <span className="sr-only">carried over from the last photo</span>}
      {state === "add" && <span className="sr-only">will be added</span>}
      {state === "remove" && <span className="sr-only">will be removed</span>}
    </button>
  );

  return (
    <TagCardPopover tagId={tag.id} tagName={tag.name}>
      {button}
    </TagCardPopover>
  );
}
