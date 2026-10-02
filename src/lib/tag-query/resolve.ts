import type { TagGroupKind } from "@/generated/prisma/client";
import type { ResolvedPredicate, TagQuery, TagSourceFilter, TagTerm } from "./types";

// Map a TagQuery onto tag ids (ADR-0033). Pure: the catalogue is passed in.
//   - a bare name matches tag name, alias or slug in any group (several
//     groups may answer — all of them count)
//   - a tag implies its sub-tags unless the term is exact (`=`)
//   - `group:*` is every tag of the group
//   - a term nothing answers to is reported in `unknown`; a clause made only
//     of unknown terms matches nothing (rather than everything)

export type CatalogTag = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  parentId: string | null;
  groupId: string;
  groupSlug: string;
  isExclusive: boolean;
  kind: TagGroupKind;
};

/** Tags of one group a term matches — exclusivity is decided per group */
export type ResolvedGroupPart = { groupId: string; isExclusive: boolean; workflow: boolean; tagIds: string[] };

export type ResolvedTerm = { source: TagSourceFilter; parts: ResolvedGroupPart[] };

export type ResolvedTagQuery = {
  all: { any: ResolvedTerm[] }[];
  none: ResolvedTerm[];
  /** Terms that matched no tag, as written */
  unknown: string[];
  /** Non-tag conditions, resolved by the service (S5); absent = none */
  predicates?: ResolvedPredicate[];
};

function descendants(catalog: CatalogTag[], rootIds: Set<string>): Set<string> {
  const result = new Set(rootIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of catalog) {
      if (t.parentId && result.has(t.parentId) && !result.has(t.id)) {
        result.add(t.id);
        grew = true;
      }
    }
  }
  return result;
}

function matchTerm(term: TagTerm, catalog: CatalogTag[]): CatalogTag[] {
  if (term.group !== null) {
    const inGroup = catalog.filter((t) => t.groupSlug === term.group);
    if (term.tag === "*") return inGroup;
    return inGroup.filter(
      (t) => t.slug === term.tag || t.name.toLowerCase() === term.tag || t.aliases.some((a) => a.toLowerCase() === term.tag),
    );
  }
  return catalog.filter(
    (t) => t.slug === term.tag || t.name.toLowerCase() === term.tag || t.aliases.some((a) => a.toLowerCase() === term.tag),
  );
}

export function resolveTerm(term: TagTerm, catalog: CatalogTag[]): ResolvedTerm {
  const roots = matchTerm(term, catalog);
  const ids = term.exact || term.tag === "*" ? new Set(roots.map((t) => t.id)) : descendants(catalog, new Set(roots.map((t) => t.id)));
  const byGroup = new Map<string, ResolvedGroupPart>();
  for (const t of catalog) {
    if (!ids.has(t.id)) continue;
    const part = byGroup.get(t.groupId) ?? {
      groupId: t.groupId,
      isExclusive: t.isExclusive,
      workflow: t.kind === "WORKFLOW",
      tagIds: [],
    };
    part.tagIds.push(t.id);
    byGroup.set(t.groupId, part);
  }
  return { source: term.source, parts: [...byGroup.values()] };
}

const describe = (t: TagTerm) => (t.group ? `${t.group}:${t.tag}` : t.tag);

export function resolveTagQuery(query: TagQuery, catalog: CatalogTag[]): ResolvedTagQuery {
  const unknown: string[] = [];
  const resolve = (t: TagTerm) => {
    const r = resolveTerm(t, catalog);
    if (r.parts.length === 0) unknown.push(describe(t));
    return r;
  };
  return {
    all: query.all.map((c) => ({ any: c.any.map(resolve) })),
    none: query.none.map(resolve).filter((r) => r.parts.length > 0),
    unknown,
  };
}

export function isEmptyResolved(q: ResolvedTagQuery): boolean {
  return q.all.length === 0 && q.none.length === 0 && (q.predicates?.length ?? 0) === 0;
}
