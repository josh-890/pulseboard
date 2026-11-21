"use client";

import { cn } from "@/lib/utils";
import { refinementOptions, type ComposerCatalog, type ComposerPath } from "@/lib/composer";
import { ComposerTile, wantsVisualTiles, type TileState } from "./composer-tile";
import type { PathStyle } from "./composer-path-style";

export type ComposerRefinementProps = {
  catalog: ComposerCatalog;
  path: ComposerPath;
  draft: string[];
  tileState: (tagId: string) => TileState;
  style: PathStyle;
  onToggle: (tagId: string, additive: boolean) => void;
  countOf?: (tagId: string) => { n: number; of: number } | undefined;
};

/**
 * The refinement section (ADR-0042, Label Studio's `visibleWhen`): the
 * refinements of every chosen base posture, unfolded in place — one block
 * each, so a duo (standing + kneeling) is refined in one pass.
 */
export function ComposerRefinement({ catalog, path, draft, tileState, style, onToggle, countOf }: ComposerRefinementProps) {
  const options = refinementOptions(catalog, path, draft);
  if (options.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
        Pick a base posture — its refinements unfold here.
      </p>
    );
  return (
    <div className="space-y-2.5" data-testid="composer-refinement">
      {options.map((o) => {
        const v = wantsVisualTiles(o.tagIds.map((id) => catalog.tags[id]));
        return (
        <div key={o.baseId} data-base={catalog.tags[o.baseId]?.name}>
          <p className={cn("mb-1 text-[11px] font-medium", style.text)}>{catalog.tags[o.baseId]?.name} ▸</p>
          {o.tagIds.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No refinements.</p>
          ) : (
            <div className={cn("grid gap-1.5", v ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
              {o.tagIds.map((id) => (
                <ComposerTile
                  key={id}
                  tag={catalog.tags[id]}
                  state={tileState(id)}
                  style={style}
                  onToggle={onToggle}
                  count={countOf?.(id)}
                  visual={v}
                  tileAspect={path.tileAspect}
                />
              ))}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
