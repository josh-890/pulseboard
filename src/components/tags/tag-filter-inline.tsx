"use client";

import { useEffect, useState } from "react";
import { getTagFilterProblemsAction } from "@/lib/actions/tag-actions";
import type { TagFacetGroup } from "@/lib/services/tag-filter-service";
import type { TaggableEntity } from "@/lib/tag-domains";
import { parseTagQuery, serializeTagQuery } from "@/lib/tag-query";
import { cn } from "@/lib/utils";
import { TagFilterButton } from "./tag-filter-button";
import { TagFilterChips } from "./tag-filter-chips";
import { TagQueryBox } from "./tag-query-box";

export type TagFilterInlineProps = {
  entityType: TaggableEntity;
  facets: TagFacetGroup[];
  /** The applied query text */
  value: string;
  onChange: (text: string) => void;
  countNoun: string;
  className?: string;
};

// The browser toolbar's tag filter (facet button + query box + chips) for
// pages that keep their filters in the client (/archive, /staging-sets). What
// the query cannot do is asked of the server and shown, never ignored.
export function TagFilterInline({ entityType, facets, value, onChange, countNoun, className }: TagFilterInlineProps) {
  const [problems, setProblems] = useState<{ text: string; list: string[] }>({ text: "", list: [] });

  useEffect(() => {
    if (!value.trim()) return;
    let alive = true;
    getTagFilterProblemsAction(value, entityType)
      .then((list) => {
        if (alive) setProblems({ text: value, list });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, entityType]);

  const query = parseTagQuery(value).query;
  const setQuery = (q: Parameters<typeof serializeTagQuery>[0]) => onChange(serializeTagQuery(q));

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <TagFilterButton facets={facets} query={query} onChange={setQuery} countNoun={countNoun} />
        <TagQueryBox value={value} onSubmit={onChange} facets={facets} entityType={entityType} />
      </div>
      {value.trim() && (
        <TagFilterChips
          entityType={entityType}
          facets={facets}
          query={query}
          onChange={setQuery}
          problems={problems.text === value ? problems.list : []}
        />
      )}
    </div>
  );
}
