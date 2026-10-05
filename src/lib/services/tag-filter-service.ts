import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  isEmptyResolved,
  parseTagQuery,
  resolveTagQuery,
  type CatalogTag,
  type ResolvedGroupPart,
  type ResolvedTagQuery,
  type ResolvedTerm,
  type TagQuery,
} from "@/lib/tag-query";
import { domainsForEntity, type TaggableEntity } from "@/lib/tag-domains";
import { predicateSql, resolvePredicates } from "./tag-predicates";

// Tag filtering in SQL (ADR-0033, S4). Same rules as `resolveEffectiveTags`
// (lib/effective-tags.ts), written as correlated EXISTS so a filter costs a
// few index probes per row:
//
//   Image  ← its own tags, the tags of each set containing it, its session's tags
//   Set    ← its own tags, its sessions' tags
//   Session, Person, Project ← own tags only
//
//   - workflow groups never inherit
//   - in an exclusive group the nearest level wins: an inherited tag counts
//     only when no nearer level carries a tag of that group
//   - a strict level (@image / @set / @session) asks that level literally

// ─── Catalogue + parsing ─────────────────────────────────────────────────────

export async function loadTagCatalog(): Promise<CatalogTag[]> {
  const tags = await prisma.tagDefinition.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      groupId: true,
      aliases: { select: { name: true } },
      group: { select: { slug: true, name: true, isExclusive: true, kind: true, domain: true } },
    },
  });
  return tags.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    aliases: t.aliases.map((a) => a.name),
    parentId: t.parentId,
    groupId: t.groupId,
    groupSlug: t.group.slug,
    isExclusive: t.group.isExclusive,
    kind: t.group.kind,
    domain: t.group.domain,
    groupName: t.group.name,
  }));
}

export type TagFilter = {
  /** The `tags=` text as given */
  text: string;
  query: TagQuery;
  resolved: ResolvedTagQuery;
  /** Parse errors + terms no tag answers to — shown, never silently ignored */
  problems: string[];
};

/**
 * Parse + resolve the `tags=` parameter for one browser; null when there is
 * nothing to filter by. Predicates are resolved too — one the browser cannot
 * answer becomes a problem, not a silent no-op.
 */
export async function resolveTagFilterParam(
  text: string | undefined | null,
  entity: TaggableEntity,
): Promise<TagFilter | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const { query, errors } = parseTagQuery(trimmed);
  const catalog = await loadTagCatalog();
  const resolved = resolveTagQuery(query, catalog);
  const predicates = await resolvePredicates(query.predicates, catalog, entity);
  resolved.predicates = predicates.resolved;
  return {
    text: trimmed,
    query,
    resolved,
    problems: [...errors, ...resolved.unknown.map((u) => `No tag “${u}”`), ...predicates.problems],
  };
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

const FALSE = Prisma.sql`FALSE`;
const TRUE = Prisma.sql`TRUE`;
const or = (parts: Prisma.Sql[]) => (parts.length === 0 ? FALSE : Prisma.sql`(${Prisma.join(parts, " OR ")})`);
const and = (parts: Prisma.Sql[]) => (parts.length === 0 ? TRUE : Prisma.sql`(${Prisma.join(parts, " AND ")})`);

/** Any tag of `ids` on the given level of the row `x` */
function levelHas(entity: TaggableEntity, level: "self" | "set" | "session", x: Prisma.Sql, ids: Prisma.Sql): Prisma.Sql {
  switch (entity) {
    case "MEDIA_ITEM":
      if (level === "self") return Prisma.sql`EXISTS (SELECT 1 FROM media_item_tag d WHERE d."mediaItemId" = ${x} AND d."tagDefinitionId" IN (${ids}))`;
      if (level === "set")
        return Prisma.sql`EXISTS (SELECT 1 FROM "SetMediaItem" smi JOIN set_tag st ON st."setId" = smi."setId" WHERE smi."mediaItemId" = ${x} AND st."tagDefinitionId" IN (${ids}))`;
      return Prisma.sql`EXISTS (SELECT 1 FROM "MediaItem" mi JOIN session_tag se ON se."sessionId" = mi."sessionId" WHERE mi.id = ${x} AND se."tagDefinitionId" IN (${ids}))`;
    case "SET":
      if (level === "self") return Prisma.sql`EXISTS (SELECT 1 FROM set_tag d WHERE d."setId" = ${x} AND d."tagDefinitionId" IN (${ids}))`;
      if (level === "session")
        return Prisma.sql`EXISTS (SELECT 1 FROM "SetSession" ss JOIN session_tag se ON se."sessionId" = ss."sessionId" WHERE ss."setId" = ${x} AND se."tagDefinitionId" IN (${ids}))`;
      return FALSE;
    case "SESSION":
      return level === "self"
        ? Prisma.sql`EXISTS (SELECT 1 FROM session_tag d WHERE d."sessionId" = ${x} AND d."tagDefinitionId" IN (${ids}))`
        : FALSE;
    case "PERSON":
      return level === "self"
        ? Prisma.sql`EXISTS (SELECT 1 FROM person_tag d WHERE d."personId" = ${x} AND d."tagDefinitionId" IN (${ids}))`
        : FALSE;
    case "PROJECT":
      return level === "self"
        ? Prisma.sql`EXISTS (SELECT 1 FROM project_tag d WHERE d."projectId" = ${x} AND d."tagDefinitionId" IN (${ids}))`
        : FALSE;
    case "ARCHIVE_FOLDER":
      return level === "self"
        ? Prisma.sql`EXISTS (SELECT 1 FROM archive_folder_tag d WHERE d."archiveFolderId" = ${x} AND d."tagDefinitionId" IN (${ids}))`
        : FALSE;
  }
}

/** Tag ids of a group, for "does a nearer level carry this group?" */
const groupTagIds = (groupId: string) => Prisma.sql`SELECT id FROM tag_definition WHERE "groupId" = ${groupId}`;

/** The entity's own level, as a strict source */
const SELF_SOURCE: Record<TaggableEntity, string> = {
  MEDIA_ITEM: "image",
  SET: "set",
  SESSION: "session",
  PERSON: "any",
  PROJECT: "any",
  ARCHIVE_FOLDER: "any",
};

function partCondition(entity: TaggableEntity, part: ResolvedGroupPart, source: ResolvedTerm["source"], x: Prisma.Sql): Prisma.Sql {
  const ids = Prisma.join(part.tagIds);
  const self = levelHas(entity, "self", x, ids);

  if (source !== "any") {
    if (source === SELF_SOURCE[entity]) return self;
    if (source === "set") return levelHas(entity, "set", x, ids);
    if (source === "session") return levelHas(entity, "session", x, ids);
    return FALSE; // e.g. @image on a set
  }

  // Effective (anywhere)
  if (entity === "SESSION" || entity === "PERSON" || entity === "PROJECT" || entity === "ARCHIVE_FOLDER" || part.workflow) return self;

  const viaSet = entity === "MEDIA_ITEM" ? levelHas(entity, "set", x, ids) : FALSE;
  const viaSession = levelHas(entity, "session", x, ids);
  if (!part.isExclusive) return or([self, viaSet, viaSession]);

  const group = groupTagIds(part.groupId);
  const selfHasGroup = levelHas(entity, "self", x, group);
  if (entity === "SET") return or([self, and([viaSession, Prisma.sql`NOT ${selfHasGroup}`])]);
  const setHasGroup = levelHas(entity, "set", x, group);
  return or([
    self,
    and([viaSet, Prisma.sql`NOT ${selfHasGroup}`]),
    and([viaSession, Prisma.sql`NOT ${selfHasGroup}`, Prisma.sql`NOT ${setHasGroup}`]),
  ]);
}

function termCondition(entity: TaggableEntity, term: ResolvedTerm, x: Prisma.Sql): Prisma.Sql {
  return or(term.parts.map((p) => partCondition(entity, p, term.source, x)));
}

/** Boolean SQL: does row `x` (an id expression) match the query? */
export function tagQueryCondition(entity: TaggableEntity, q: ResolvedTagQuery, x: Prisma.Sql): Prisma.Sql {
  return and([
    ...q.all.map((c) => or(c.any.map((t) => termCondition(entity, t, x)))),
    ...q.none.map((t) => Prisma.sql`NOT ${termCondition(entity, t, x)}`),
    ...(q.predicates ?? []).map((p) => predicateSql(entity, p, x)),
  ]);
}

const ENTITY_TABLE: Record<TaggableEntity, string> = {
  MEDIA_ITEM: `"MediaItem"`,
  SET: `"Set"`,
  SESSION: `"Session"`,
  PERSON: `"Person"`,
  PROJECT: `"Project"`,
  ARCHIVE_FOLDER: `archive_folder`,
};

/**
 * Ids of the entities matching the query, optionally only among `within`.
 * The browsers feed these into their existing Prisma `where` as `id IN …`.
 */
/**
 * Every entity that could match a clause, gathered from the tag tables (indexed
 * by tag) instead of probing each row — a superset; the full condition decides.
 */
function clauseCandidates(entity: TaggableEntity, clause: ResolvedTagQuery["all"][number]): Prisma.Sql {
  const tagIds = [...new Set(clause.any.flatMap((t) => t.parts.flatMap((p) => p.tagIds)))];
  if (tagIds.length === 0) return Prisma.sql`SELECT NULL::text AS id WHERE FALSE`;
  const ids = Prisma.join(tagIds);
  switch (entity) {
    case "MEDIA_ITEM":
      return Prisma.sql`
        SELECT "mediaItemId" AS id FROM media_item_tag WHERE "tagDefinitionId" IN (${ids})
        UNION SELECT smi."mediaItemId" FROM set_tag st JOIN "SetMediaItem" smi ON smi."setId" = st."setId" WHERE st."tagDefinitionId" IN (${ids})
        UNION SELECT mi.id FROM session_tag se JOIN "MediaItem" mi ON mi."sessionId" = se."sessionId" WHERE se."tagDefinitionId" IN (${ids})`;
    case "SET":
      return Prisma.sql`
        SELECT "setId" AS id FROM set_tag WHERE "tagDefinitionId" IN (${ids})
        UNION SELECT ss."setId" FROM session_tag se JOIN "SetSession" ss ON ss."sessionId" = se."sessionId" WHERE se."tagDefinitionId" IN (${ids})`;
    case "SESSION":
      return Prisma.sql`SELECT "sessionId" AS id FROM session_tag WHERE "tagDefinitionId" IN (${ids})`;
    case "PERSON":
      return Prisma.sql`SELECT "personId" AS id FROM person_tag WHERE "tagDefinitionId" IN (${ids})`;
    case "PROJECT":
      return Prisma.sql`SELECT "projectId" AS id FROM project_tag WHERE "tagDefinitionId" IN (${ids})`;
    case "ARCHIVE_FOLDER":
      return Prisma.sql`SELECT "archiveFolderId" AS id FROM archive_folder_tag WHERE "tagDefinitionId" IN (${ids})`;
  }
}

export async function findTagMatchIds(entity: TaggableEntity, q: ResolvedTagQuery, within?: string[]): Promise<string[]> {
  if (within && within.length === 0) return [];
  const x = Prisma.sql`e.id`;
  const cond = isEmptyResolved(q) ? TRUE : tagQueryCondition(entity, q, x);
  const scope = within ? Prisma.sql`AND e.id = ANY(${within})` : Prisma.empty;
  const table = Prisma.raw(ENTITY_TABLE[entity]);
  // A positive clause narrows the work to its candidates, materialised first so
  // the planner probes the condition only for them; a NOT-only query scans.
  const sql =
    q.all.length > 0
      ? Prisma.sql`
          WITH cand AS MATERIALIZED (${clauseCandidates(entity, q.all[0])})
          SELECT e.id FROM cand JOIN ${table} e ON e.id = cand.id
          WHERE ${cond} ${scope}`
      : Prisma.sql`SELECT e.id FROM ${table} e WHERE ${cond} ${scope}`;
  const rows = await withoutJit((tx) => tx.$queryRaw<Array<{ id: string }>>(sql));
  return rows.map((r) => r.id);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Run a query with JIT off. The correlated EXISTS terms make the planner's
 * cost estimate huge, which switches JIT compilation on (measured on xpulse:
 * ~0.6 s of compiling for a query touching a few hundred rows).
 */
async function withoutJit<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL jit = off`;
    return fn(tx);
  });
}

// ─── Facet counts ────────────────────────────────────────────────────────────

/**
 * For the facet panel: per tag, how many of `ids` carry it effectively
 * (own + inherited, nearest level winning in exclusive groups, workflow
 * own-only). `ids = null` counts over every entity of the type.
 */
export async function getTagFacetCounts(entity: TaggableEntity, ids: string[] | null): Promise<Record<string, number>> {
  if (ids && ids.length === 0) return {};
  const inIds = (col: Prisma.Sql) => (ids ? Prisma.sql`AND ${col} = ANY(${ids})` : Prisma.empty);

  let raw: Prisma.Sql;
  switch (entity) {
    case "MEDIA_ITEM":
      raw = Prisma.sql`
        SELECT d."mediaItemId" AS eid, d."tagDefinitionId" AS tid, 0 AS lvl FROM media_item_tag d WHERE TRUE ${inIds(Prisma.sql`d."mediaItemId"`)}
        UNION ALL
        SELECT smi."mediaItemId", st."tagDefinitionId", 1 FROM "SetMediaItem" smi JOIN set_tag st ON st."setId" = smi."setId" WHERE TRUE ${inIds(Prisma.sql`smi."mediaItemId"`)}
        UNION ALL
        SELECT mi.id, se."tagDefinitionId", 2 FROM "MediaItem" mi JOIN session_tag se ON se."sessionId" = mi."sessionId" WHERE TRUE ${inIds(Prisma.sql`mi.id`)}`;
      break;
    case "SET":
      raw = Prisma.sql`
        SELECT d."setId" AS eid, d."tagDefinitionId" AS tid, 0 AS lvl FROM set_tag d WHERE TRUE ${inIds(Prisma.sql`d."setId"`)}
        UNION ALL
        SELECT ss."setId", se."tagDefinitionId", 2 FROM "SetSession" ss JOIN session_tag se ON se."sessionId" = ss."sessionId" WHERE TRUE ${inIds(Prisma.sql`ss."setId"`)}`;
      break;
    case "SESSION":
      raw = Prisma.sql`SELECT d."sessionId" AS eid, d."tagDefinitionId" AS tid, 0 AS lvl FROM session_tag d WHERE TRUE ${inIds(Prisma.sql`d."sessionId"`)}`;
      break;
    case "PERSON":
      raw = Prisma.sql`SELECT d."personId" AS eid, d."tagDefinitionId" AS tid, 0 AS lvl FROM person_tag d WHERE TRUE ${inIds(Prisma.sql`d."personId"`)}`;
      break;
    case "PROJECT":
      raw = Prisma.sql`SELECT d."projectId" AS eid, d."tagDefinitionId" AS tid, 0 AS lvl FROM project_tag d WHERE TRUE ${inIds(Prisma.sql`d."projectId"`)}`;
      break;
    case "ARCHIVE_FOLDER":
      raw = Prisma.sql`SELECT d."archiveFolderId" AS eid, d."tagDefinitionId" AS tid, 0 AS lvl FROM archive_folder_tag d WHERE TRUE ${inIds(Prisma.sql`d."archiveFolderId"`)}`;
      break;
  }

  const rows = await withoutJit((tx) => tx.$queryRaw<Array<{ tid: string; cnt: bigint }>>(Prisma.sql`
    WITH raw AS (${raw}),
    facts AS (
      SELECT r.eid, r.tid, r.lvl, td."groupId" AS gid, tg."isExclusive" AS excl
      FROM raw r
      JOIN tag_definition td ON td.id = r.tid
      JOIN tag_group tg ON tg.id = td."groupId"
      WHERE r.lvl = 0 OR tg.kind <> 'WORKFLOW'
    ),
    nearest AS (
      SELECT eid, gid, min(lvl) AS lvl FROM facts WHERE excl GROUP BY eid, gid
    )
    SELECT f.tid, count(DISTINCT f.eid)::bigint AS cnt
    FROM facts f
    LEFT JOIN nearest n ON n.eid = f.eid AND n.gid = f.gid
    WHERE NOT f.excl OR f.lvl = n.lvl
    GROUP BY f.tid
  `));
  return Object.fromEntries(rows.map((r) => [r.tid, Number(r.cnt)]));
}

// ─── Facet panel data ────────────────────────────────────────────────────────

export type TagFacetTag = { id: string; name: string; slug: string; parentId: string | null; count: number };

export type TagFacetGroup = {
  id: string;
  name: string;
  slug: string;
  color: string;
  isExclusive: boolean;
  workflow: boolean;
  tags: TagFacetTag[];
};

/**
 * Groups + tags the facet panel offers for an entity type, each tag with how
 * many entities of that type carry it effectively (inherited included) —
 * among `withinIds` when given (a gallery counts its own images).
 * Workflow groups come last — they are to-dos, not descriptions.
 */
export async function getTagFacets(entityType: TaggableEntity, withinIds: string[] | null = null): Promise<TagFacetGroup[]> {
  const [groups, counts] = await Promise.all([
    prisma.tagGroup.findMany({
      where: { domain: { in: domainsForEntity(entityType) } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        isExclusive: true,
        kind: true,
        tags: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, slug: true, parentId: true } },
      },
    }),
    getTagFacetCounts(entityType, withinIds),
  ]);
  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      color: g.color,
      isExclusive: g.isExclusive,
      workflow: g.kind === "WORKFLOW",
      tags: g.tags.map((t) => ({ ...t, count: counts[t.id] ?? 0 })),
    }))
    .filter((g) => g.tags.length > 0)
    .sort((a, b) => Number(a.workflow) - Number(b.workflow));
}
