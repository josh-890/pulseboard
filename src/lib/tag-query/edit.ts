import type { TagClause, TagQuery, TagSourceFilter, TagTerm } from "./types";

// Edits the facet panel and the filter chips make to a TagQuery (ADR-0033).
// Facet semantics: inside a group tags are OR-ed (one clause `group:a,b`),
// groups are AND-ed; a group switched to "all" holds one clause per tag.
// Pure — every function returns a new query.

export type TagFacetState = "include" | "exclude" | "none";
export type GroupMatchMode = "any" | "all";

const same = (t: TagTerm, group: string, tag: string) => t.group === group && t.tag === tag;

/** A clause made only of plain (any-level, non-exact) terms of one group */
function isPlainGroupClause(c: TagClause, group: string): boolean {
  return c.any.length > 0 && c.any.every((t) => t.group === group && t.source === "any" && !t.exact);
}

export function tagFacetState(q: TagQuery, group: string, tag: string): TagFacetState {
  if (q.none.some((t) => same(t, group, tag))) return "exclude";
  if (q.all.some((c) => c.any.some((t) => same(t, group, tag)))) return "include";
  return "none";
}

/** "all" when the group is held as several single-tag clauses, else "any" */
export function groupMatchMode(q: TagQuery, group: string): GroupMatchMode {
  const plain = q.all.filter((c) => isPlainGroupClause(c, group));
  return plain.length > 1 && plain.every((c) => c.any.length === 1) ? "all" : "any";
}

/** Drop a tag from every clause and from the exclusions; empty clauses vanish */
export function removeTag(q: TagQuery, group: string, tag: string): TagQuery {
  return {
    ...q,
    all: q.all.map((c) => ({ any: c.any.filter((t) => !same(t, group, tag)) })).filter((c) => c.any.length > 0),
    none: q.none.filter((t) => !same(t, group, tag)),
  };
}

export function includeTag(q: TagQuery, group: string, tag: string, mode: GroupMatchMode = groupMatchMode(q, group)): TagQuery {
  const base = removeTag(q, group, tag);
  const term: TagTerm = { group, tag, exact: false, source: "any" };
  if (mode === "any") {
    const i = base.all.findIndex((c) => isPlainGroupClause(c, group));
    if (i >= 0) {
      const all = base.all.slice();
      all[i] = { any: [...all[i].any, term] };
      return { ...base, all };
    }
  }
  return { ...base, all: [...base.all, { any: [term] }] };
}

export function excludeTag(q: TagQuery, group: string, tag: string): TagQuery {
  const base = removeTag(q, group, tag);
  return { ...base, none: [...base.none, { group, tag, exact: false, source: "any" }] };
}

/** Click: none → include → none. Alt/right-click: none → exclude → none. */
export function cycleTag(q: TagQuery, group: string, tag: string, exclude: boolean): TagQuery {
  const state = tagFacetState(q, group, tag);
  if (exclude) return state === "exclude" ? removeTag(q, group, tag) : excludeTag(q, group, tag);
  return state === "include" ? removeTag(q, group, tag) : includeTag(q, group, tag);
}

/** Switch a group between OR (one clause) and AND (a clause per tag) */
export function setGroupMatchMode(q: TagQuery, group: string, mode: GroupMatchMode): TagQuery {
  const plainTerms = q.all.filter((c) => isPlainGroupClause(c, group)).flatMap((c) => c.any);
  if (plainTerms.length === 0) return q;
  const rest = q.all.filter((c) => !isPlainGroupClause(c, group));
  const regrouped: TagClause[] = mode === "any" ? [{ any: plainTerms }] : plainTerms.map((t) => ({ any: [t] }));
  return { ...q, all: [...rest, ...regrouped] };
}

/** Change where every term of a clause must sit */
export function setClauseSource(q: TagQuery, index: number, source: TagSourceFilter): TagQuery {
  const all = q.all.slice();
  all[index] = { any: all[index].any.map((t) => ({ ...t, source })) };
  return { ...q, all };
}

export function removeClause(q: TagQuery, index: number): TagQuery {
  return { ...q, all: q.all.filter((_, i) => i !== index) };
}

export function removeExclusion(q: TagQuery, index: number): TagQuery {
  return { ...q, none: q.none.filter((_, i) => i !== index) };
}

export function removePredicate(q: TagQuery, index: number): TagQuery {
  return { ...q, predicates: q.predicates.filter((_, i) => i !== index) };
}
