"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { Ban, Check, ListTodo, Lock, Search } from "lucide-react";
import type { TagFacetGroup, TagFacetTag } from "@/lib/services/tag-filter-service";
import {
  cycleTag,
  groupMatchMode,
  setGroupMatchMode,
  tagFacetState,
  type TagQuery,
} from "@/lib/tag-query";
import { cn } from "@/lib/utils";

export type TagFacetPanelProps = {
  facets: TagFacetGroup[];
  query: TagQuery;
  onChange: (query: TagQuery) => void;
  /** Noun for the counts' tooltip, e.g. "people" */
  countNoun: string;
};

function depthMap(tags: TagFacetTag[]): Map<string, number> {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const of = (t: TagFacetTag, guard = 0): number => {
    if (depth.has(t.id)) return depth.get(t.id) as number;
    const parent = t.parentId ? byId.get(t.parentId) : undefined;
    const d = parent && guard < 10 ? of(parent, guard + 1) + 1 : 0;
    depth.set(t.id, d);
    return d;
  };
  tags.forEach((t) => of(t));
  return depth;
}

// The tag facet panel (ADR-0033, S4). Click a tag to include it, click again
// to drop it; Alt-click, right-click or the ⊘ button excludes it. Tags of one
// group are OR-ed ("any") — the group header switches that to "all"; groups
// are AND-ed. A sub-tag is indented under its parent; filtering by the parent
// also finds it. Counts are how many carry the tag, inherited included.
export function TagFacetPanel({ facets, query, onChange, countNoun }: TagFacetPanelProps) {
  const [search, setSearch] = useState("");
  const [showUnused, setShowUnused] = useState(false);
  const norm = search.trim().toLowerCase();

  const groups = useMemo(
    () =>
      facets
        .map((g) => {
          const depth = depthMap(g.tags);
          const tags = g.tags.filter((t) => {
            const state = tagFacetState(query, g.slug, t.slug);
            if (state !== "none") return true;
            if (norm && !t.name.toLowerCase().includes(norm) && !g.name.toLowerCase().includes(norm)) return false;
            return showUnused || t.count > 0;
          });
          return { group: g, tags, depth };
        })
        .filter((x) => x.tags.length > 0),
    [facets, query, norm, showUnused],
  );

  const toggle = (g: TagFacetGroup, t: TagFacetTag, exclude: boolean) => onChange(cycleTag(query, g.slug, t.slug, exclude));

  return (
    <div className="flex max-h-[min(70vh,520px)] w-[min(92vw,22rem)] flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Search size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a tag…"
          className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          aria-label="Find a tag"
          autoFocus
        />
        <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showUnused}
            onChange={(e) => setShowUnused(e.target.checked)}
            className="h-3 w-3"
          />
          unused
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {norm ? "No tag matches." : `No tags on any ${countNoun} yet.`}
          </p>
        )}
        {groups.map(({ group: g, tags, depth }) => {
          const mode = groupMatchMode(query, g.slug);
          const included = g.tags.filter((t) => tagFacetState(query, g.slug, t.slug) === "include").length;
          return (
            <section key={g.id} className="py-1" aria-label={g.name}>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: g.color }} aria-hidden="true" />
                <span className="flex-1">{g.name}</span>
                {g.isExclusive && <Lock size={10} aria-label="one per item" />}
                {g.workflow && <ListTodo size={11} aria-label="workflow" />}
                {included > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(setGroupMatchMode(query, g.slug, mode === "any" ? "all" : "any"))}
                    className="rounded border border-white/15 px-1 py-px text-[10px] normal-case tracking-normal transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title={mode === "any" ? "Matching any of these — switch to all" : "Matching all of these — switch to any"}
                  >
                    {mode === "any" ? "any" : "all"}
                  </button>
                )}
              </div>
              <ul>
                {tags.map((t) => {
                  const state = tagFacetState(query, g.slug, t.slug);
                  return (
                    <li key={t.id} className="group/row flex items-center">
                      <button
                        type="button"
                        onClick={(e: MouseEvent) => toggle(g, t, e.altKey)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggle(g, t, true);
                        }}
                        aria-pressed={state === "include" ? true : state === "exclude" ? "mixed" : false}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors duration-150",
                          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          state === "include" && "bg-primary/10",
                          state === "exclude" && "bg-red-500/10 text-red-400 line-through",
                        )}
                        style={{ paddingLeft: `${0.5 + (depth.get(t.id) ?? 0) * 0.9}rem` }}
                      >
                        {state === "exclude" ? (
                          <Ban size={13} className="shrink-0" aria-hidden="true" />
                        ) : (
                          <Check size={13} className={cn("shrink-0", state === "include" ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                        )}
                        <span className="truncate">{t.name}</span>
                        <span
                          className="ml-auto text-xs tabular-nums text-muted-foreground"
                          title={`${t.name}: ${t.count} ${countNoun} (own or inherited)`}
                        >
                          {t.count}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(g, t, true)}
                        className="invisible rounded p-1 text-muted-foreground hover:text-red-400 focus-visible:visible focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/row:visible"
                        aria-label={state === "exclude" ? `Stop excluding ${t.name}` : `Exclude ${t.name}`}
                        title="Exclude (Alt-click)"
                      >
                        <Ban size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="border-t border-white/10 px-3 py-1.5 text-[10px] text-muted-foreground">
        Click includes · Alt-click excludes · a parent finds its sub-tags
      </p>
    </div>
  );
}
