"use client";

import { cn } from "@/lib/utils";
import type { ComposerCatalog, ComposerSection } from "@/lib/composer";
import type { PathStyle } from "./composer-path-style";
import type { TileState } from "./composer-tile";

export type ComposerShotRowProps = {
  catalog: ComposerCatalog;
  section: ComposerSection;
  style: PathStyle;
  tileState: (tagId: string) => TileState;
  onToggle: (tagId: string, additive: boolean) => void;
};

/**
 * The shot, asked first (ADR-0043): a slim row above the paths. What it says
 * decides, through relevance, which paths and facets are asked at all — a
 * close-up drops the pose and asks for the region.
 */
export function ComposerShotRow({ catalog, section, style, tileState, onToggle }: ComposerShotRowProps) {
  const ids = section.groupIds.flatMap((g) => catalog.groups[g]?.tagIds ?? []);
  return (
    <div role="group" aria-label={section.name} className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5" data-testid="composer-shot-row">
      <span className="shrink-0 pr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{section.name}</span>
      {ids.map((id) => {
        const state = tileState(id);
        const on = state === "on" || state === "proposed" || state === "add";
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => onToggle(id, e.shiftKey)}
            aria-pressed={on}
            title={catalog.tags[id]?.description ?? undefined}
            data-testid="composer-shot"
            data-tag={catalog.tags[id]?.name}
            data-state={state}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state === "on" && cn(style.on, style.text),
              state === "proposed" && cn("border-dashed", style.on, style.text),
              state === "add" && "border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              state === "remove" && "border-rose-500/60 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300",
              state === "partial" && "border-border bg-muted/50",
              (state === "off" || state === "implied") && "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {catalog.tags[id]?.name}
          </button>
        );
      })}
    </div>
  );
}
