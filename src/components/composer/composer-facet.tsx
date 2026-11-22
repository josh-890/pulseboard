"use client";

import { forwardRef } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerCatalog, FacetView } from "@/lib/composer";
import type { PathStyle } from "./composer-path-style";
import { ComposerTile, wantsVisualTiles, type TileState } from "./composer-tile";

export type ComposerFacetProps = {
  catalog: ComposerCatalog;
  view: FacetView;
  /** Tags chosen in this facet — the folded line names them */
  chosen: string[];
  tileState: (tagId: string) => TileState;
  style: PathStyle;
  onToggle: (tagId: string, additive: boolean) => void;
  countOf?: (tagId: string) => { n: number; of: number } | undefined;
  tileAspect: string;
  /** Show the facet's name (sections with more than one facet) */
  showName: boolean;
  /** A ONE facet with a choice: one slim line, ✎ reopens */
  collapsed: boolean;
  onReopen: () => void;
  /** The next facet to answer (focus flow) */
  focused: boolean;
  /** "more …" is open */
  showMore: boolean;
  onShowMore: () => void;
};

/**
 * One facet of a path (ADR-0043): its values under the photo's contexts —
 * typical first, the merely possible behind "more …", impossible ones left out.
 * A ONE facet folds to a line once answered; the next facet to answer is
 * outlined.
 */
export const ComposerFacet = forwardRef<HTMLDivElement, ComposerFacetProps>(function ComposerFacet(
  { catalog, view, chosen, tileState, style, onToggle, countOf, tileAspect, showName, collapsed, onReopen, focused, showMore, onShowMore },
  ref,
) {
  const group = catalog.groups[view.groupId];
  const shown = showMore ? [...view.shown, ...view.more] : view.shown;
  const visual = wantsVisualTiles([...view.shown, ...view.more].map((id) => catalog.tags[id]));
  const one = group?.choice === "ONE";

  if (collapsed)
    return (
      <div ref={ref} data-testid="composer-facet" data-facet={group?.name} data-collapsed="true">
        <button
          type="button"
          onClick={onReopen}
          className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2 py-1 text-left text-xs transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${group?.name}: ${chosen.map((id) => catalog.tags[id]?.name).join(", ")} — change`}
        >
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group?.name}</span>
          <span className={cn("min-w-0 flex-1 truncate font-medium", style.text)}>{chosen.map((id) => catalog.tags[id]?.name).join(" · ")}</span>
          <Pencil size={12} aria-hidden className="shrink-0 text-muted-foreground" />
        </button>
      </div>
    );

  return (
    <div
      ref={ref}
      data-testid="composer-facet"
      data-facet={group?.name}
      data-focused={focused ? "true" : undefined}
      className={cn("rounded-lg transition-shadow duration-200", focused && cn("ring-2 ring-offset-2 ring-offset-card", style.ring))}
    >
      {(showName || focused) && (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {group?.name}
          {one && <span className="ml-1 normal-case tracking-normal">· one</span>}
          {focused && <span className={cn("ml-1.5 normal-case tracking-normal", style.text)}>next</span>}
        </p>
      )}
      <div className={cn("grid gap-1.5", visual ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
        {shown.map((id) => (
          <ComposerTile
            key={id}
            tag={catalog.tags[id]}
            state={tileState(id)}
            style={style}
            onToggle={onToggle}
            count={countOf?.(id)}
            visual={visual}
            tileAspect={tileAspect}
          />
        ))}
      </div>
      {view.more.length > 0 && !showMore && (
        <button
          type="button"
          onClick={onShowMore}
          data-testid="composer-facet-more"
          className="mt-1 inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown size={12} aria-hidden /> {view.more.length} more
        </button>
      )}
    </div>
  );
});
