// Tag query AST (ADR-0033). One shape behind the facet panel, the filter
// chips, the `tags=` URL parameter and (S5/S6) the query box and saved
// filters. Pure — no catalogue knowledge; `resolve.ts` maps it onto tag ids.

/**
 * Where a tag must sit for a term to match.
 *   any     — the entity's effective tags (own + inherited down the content
 *             chain, nearest level winning inside an exclusive group)
 *   image / set / session — strictly that level: the image's own tags, the
 *             tags of a set it is in, the tags of its session
 */
export type TagSourceFilter = "any" | "image" | "set" | "session";

export type TagTerm = {
  /** Group slug; null for a bare name resolved by tag name / alias / slug */
  group: string | null;
  /** Tag slug (or the bare name when `group` is null); "*" = any tag of the group */
  tag: string;
  /** true: this tag only — its sub-tags do not count */
  exact: boolean;
  source: TagSourceFilter;
};

/** Terms OR-ed together */
export type TagClause = { any: TagTerm[] };

/** Non-tag conditions (S5): `is:fav`, `rating>=4`, `person:AB-123`… kept verbatim here */
export type QueryPredicate = { key: string; op: ":" | "=" | ">=" | "<=" | ">" | "<"; value: string };

export type TagQuery = {
  /** Every clause must match (AND) */
  all: TagClause[];
  /** No term may match */
  none: TagTerm[];
  predicates: QueryPredicate[];
};

export const EMPTY_TAG_QUERY: TagQuery = { all: [], none: [], predicates: [] };

export function isEmptyTagQuery(q: TagQuery): boolean {
  return q.all.length === 0 && q.none.length === 0 && q.predicates.length === 0;
}
