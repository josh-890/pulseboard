"use client";

import { cn } from "@/lib/utils";
import { refinementOptions, type ComposerCatalog, type ComposerPath } from "@/lib/composer";
import { ComposerTile, type TileState } from "./composer-tile";
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
      {options.map((o) => (
        <div key={o.baseId} data-base={catalog.tags[o.baseId]?.name}>
          <p className={cn("mb-1 text-[11px] font-medium", style.text)}>{catalog.tags[o.baseId]?.name} ▸</p>
          {o.tagIds.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No refinements.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {o.tagIds.map((id) => (
                <ComposerTile key={id} tag={catalog.tags[id]} state={tileState(id)} style={style} onToggle={onToggle} count={countOf?.(id)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
