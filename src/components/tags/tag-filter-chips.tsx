"use client";

import { AlertTriangle, X } from "lucide-react";
import type { TagFacetGroup } from "@/lib/services/tag-filter-service";
import type { TaggableEntity } from "@/lib/tag-domains";
import {
  predicateLabel,
  removeClause,
  removeExclusion,
  removePredicate,
  setClauseSource,
  type TagQuery,
  type TagSourceFilter,
  type TagTerm,
} from "@/lib/tag-query";

// Which levels a filter can ask strictly, per browser (ADR-0033)
const SOURCES: Record<TaggableEntity, { value: TagSourceFilter; label: string }[]> = {
  MEDIA_ITEM: [
    { value: "any", label: "anywhere" },
    { value: "image", label: "on the image" },
    { value: "set", label: "on its set" },
    { value: "session", label: "on its session" },
  ],
  SET: [
    { value: "any", label: "anywhere" },
    { value: "set", label: "on the set" },
    { value: "session", label: "on its session" },
  ],
  SESSION: [],
  PERSON: [],
  PROJECT: [],
  ARCHIVE_FOLDER: [],
};

export type TagFilterChipsProps = {
  entityType: TaggableEntity;
  facets: TagFacetGroup[];
  query: TagQuery;
  onChange: (query: TagQuery) => void;
  problems?: string[];
};

// Active tag filters as chips (ADR-0033, S4): one per clause ("Location: Beach
// or Pool") with a level switch where the browser has levels, one per
// exclusion ("not Studio"), and any terms the catalogue could not resolve.
export function TagFilterChips({ entityType, facets, query, onChange, problems = [] }: TagFilterChipsProps) {
  const groupBySlug = new Map(facets.map((g) => [g.slug, g]));
  const label = (t: TagTerm) => {
    if (!t.group) return t.tag;
    const g = groupBySlug.get(t.group);
    const name = t.tag === "*" ? "any" : (g?.tags.find((x) => x.slug === t.tag)?.name ?? t.tag);
    return `${name}${t.exact ? " (exactly)" : ""}`;
  };
  const groupName = (t: TagTerm) => (t.group ? (groupBySlug.get(t.group)?.name ?? t.group) : "Tag");
  const sources = SOURCES[entityType];

  return (
    <>
      {query.all.map((clause, i) => {
        const [first] = clause.any;
        const oneGroup = clause.any.every((t) => t.group === first.group);
        const text = oneGroup
          ? `${groupName(first)}: ${clause.any.map(label).join(" or ")}`
          : clause.any.map((t) => `${groupName(t)}: ${label(t)}`).join(" or ");
        const source = clause.any.every((t) => t.source === first.source) ? first.source : "any";
        return (
          <span
            key={`c${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
          >
            {text}
            {sources.length > 0 && (
              <select
                value={source}
                onChange={(e) => onChange(setClauseSource(query, i, e.target.value as TagSourceFilter))}
                className="rounded border border-primary/20 bg-transparent px-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring [&>option]:text-black"
                aria-label={`Where ${text} must be`}
              >
                {sources.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => onChange(removeClause(query, i))}
              className="rounded-full p-0.5 transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`Remove filter ${text}`}
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
      {query.none.map((t, i) => (
        <button
          key={`n${i}`}
          type="button"
          onClick={() => onChange(removeExclusion(query, i))}
          className="inline-flex items-center gap-1 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Remove exclusion ${label(t)}`}
        >
          not {groupName(t)}: {label(t)}
          <X size={10} />
        </button>
      ))}
      {query.predicates.map((p, i) => (
        <button
          key={`p${i}`}
          type="button"
          onClick={() => onChange(removePredicate(query, i))}
          className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Remove filter ${predicateLabel(p)}`}
        >
          {predicateLabel(p)}
          <X size={10} />
        </button>
      ))}
      {problems.map((p) => (
        <span key={p} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
          <AlertTriangle size={11} aria-hidden="true" />
          {p}
        </span>
      ))}
    </>
  );
}
