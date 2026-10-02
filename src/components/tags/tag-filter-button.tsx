"use client";

import { Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TagFacetGroup } from "@/lib/services/tag-filter-service";
import type { TagQuery } from "@/lib/tag-query";
import { cn } from "@/lib/utils";
import { TagFacetPanel } from "./tag-facet-panel";

export type TagFilterButtonProps = {
  facets: TagFacetGroup[];
  query: TagQuery;
  onChange: (query: TagQuery) => void;
  countNoun: string;
};

// The browser toolbar's "Tags" filter: a button opening the facet panel.
export function TagFilterButton({ facets, query, onChange, countNoun }: TagFilterButtonProps) {
  const active = query.all.reduce((n, c) => n + c.any.length, 0) + query.none.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active > 0
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-white/15 bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
          aria-label={active > 0 ? `Tags filter, ${active} active` : "Filter by tags"}
        >
          <Tag size={13} aria-hidden="true" />
          Tags
          {active > 0 && <span className="rounded-full bg-primary/20 px-1.5 text-[10px] tabular-nums">{active}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <TagFacetPanel facets={facets} query={query} onChange={onChange} countNoun={countNoun} />
      </PopoverContent>
    </Popover>
  );
}
