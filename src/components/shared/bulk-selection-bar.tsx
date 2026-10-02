"use client";

import { CheckSquare, X } from "lucide-react";
import { BulkTagControls } from "@/components/tags";
import type { TaggableEntity } from "@/lib/tag-domains";
import { cn } from "@/lib/utils";

type BulkSelectionBarProps = {
  selectedIds: Set<string>;
  entityType: TaggableEntity;
  onClear: () => void;
  totalCount: number;
  onSelectAll?: () => void;
};

// Selection bar for the person, set and session grids. Tagging is the shared
// BulkTagControls (tri-state palette T, slots 1–9, armed tag P — ADR-0033).
// The cards update on their own: the bulk actions revalidate /people, /sets
// and /sessions, which re-renders this page once each write has landed.
export function BulkSelectionBar({
  selectedIds,
  entityType,
  onClear,
  totalCount,
  onSelectAll,
}: BulkSelectionBarProps) {
  if (selectedIds.size === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" data-tag-selection-active="">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-2xl border border-white/20 bg-card/90 px-4 py-2.5 shadow-2xl backdrop-blur-xl",
          "dark:border-white/10 dark:bg-card/95",
        )}
      >
        <span className="text-sm font-medium">
          {selectedIds.size} selected
        </span>

        {onSelectAll && selectedIds.size < totalCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <CheckSquare className="h-3 w-3" />
            All {totalCount}
          </button>
        )}

        <div className="h-4 w-px bg-border" />

        <BulkTagControls entityType={entityType} entityIds={[...selectedIds]} />

        <div className="h-4 w-px bg-border" />

        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Clear selection"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
