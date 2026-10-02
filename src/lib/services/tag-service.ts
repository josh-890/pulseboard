import { prisma } from "@/lib/db";
import type { TagDomain, TagGroupKind, TagLevel } from "@/generated/prisma/client";
import { domainsForEntity, type TaggableEntity } from "./entity-tag-service";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalize(name: string): string {
  return name.toLowerCase().trim();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type TagGroupWithDefinitions = Awaited<
  ReturnType<typeof getAllTagGroups>
>[number];

export type TagDefinitionWithGroup = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  typicalLevel: TagLevel | null;
  sortOrder: number;
  group: {
    id: string;
    name: string;
    slug: string;
    color: string;
    isExclusive: boolean;
    domain: TagDomain;
    typicalLevel: TagLevel | null;
    kind: TagGroupKind;
  };
  aliases?: { name: string }[];
};

export type TagUsageBreakdown = {
  id: string;
  name: string;
  groupName: string;
  groupColor: string;
  person: number;
  session: number;
  media: number;
  set: number;
  project: number;
  total: number;
};

export type NearDuplicatePair = {
  tagA: { id: string; name: string; groupName: string };
  tagB: { id: string; name: string; groupName: string };
  similarity: number;
};

// ─── Group Includes ─────────────────────────────────────────────────────────

const GROUP_SELECT = {
  id: true,
  name: true,
  slug: true,
  color: true,
  isExclusive: true,
  domain: true,
  typicalLevel: true,
  kind: true,
} as const;

/** The level a tag is typically applied at: its own override, else its group's. */
export function effectiveTypicalLevel(tag: Pick<TagDefinitionWithGroup, "typicalLevel" | "group">): TagLevel | null {
  return tag.typicalLevel ?? tag.group.typicalLevel;
}

/**
 * Picker ranking for an entity type: inside the content chain, tags whose
 * typical level is this entity come first (a soft hint — nothing is hidden).
 * Stable otherwise, so group/tag sort order survives.
 */
export function rankForEntity<T extends Pick<TagDefinitionWithGroup, "typicalLevel" | "group">>(
  tags: T[],
  entityType: TaggableEntity,
): T[] {
  if (entityType === "PERSON" || entityType === "PROJECT") return tags;
  const fits = (t: T) => (effectiveTypicalLevel(t) === entityType ? 0 : 1);
  return tags
    .map((t, i) => ({ t, i }))
    .sort((a, b) => fits(a.t) - fits(b.t) || a.i - b.i)
    .map(({ t }) => t);
}

/** Reject a parent assignment that would make the hierarchy cyclic. */
async function assertNoCycle(tagId: string, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (parentId === tagId) throw new Error("A tag cannot be its own parent");
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId" FROM tag_definition WHERE id = ${parentId}
      UNION
      SELECT td.id, td."parentId" FROM tag_definition td JOIN ancestors a ON td.id = a."parentId"
    )
    SELECT id FROM ancestors WHERE id = ${tagId}
  `;
  if (rows.length > 0) throw new Error("That parent would create a cycle");
}

// ─── Group CRUD ─────────────────────────────────────────────────────────────

export async function getAllTagGroups() {
  return prisma.tagGroup.findMany({
    include: {
      tags: {
        orderBy: { sortOrder: "asc" },
        include: { aliases: { select: { id: true, name: true } } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

type TagGroupFields = {
  domain?: TagDomain;
  typicalLevel?: TagLevel | null;
  kind?: TagGroupKind;
};

export async function createTagGroup(data: {
  name: string;
  color?: string;
  description?: string;
  isExclusive?: boolean;
} & TagGroupFields) {
  const maxOrder = await prisma.tagGroup.aggregate({
    _max: { sortOrder: true },
  });
  return prisma.tagGroup.create({
    data: {
      name: data.name,
      slug: slugify(data.name),
      color: data.color ?? "#6b7280",
      description: data.description ?? null,
      isExclusive: data.isExclusive ?? false,
      domain: data.domain ?? "ANY",
      typicalLevel: data.typicalLevel ?? null,
      kind: data.kind ?? "DESCRIPTIVE",
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateTagGroup(
  id: string,
  data: { name?: string; color?: string; description?: string | null; isExclusive?: boolean } & TagGroupFields,
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.color !== undefined) updateData.color = data.color;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isExclusive !== undefined) updateData.isExclusive = data.isExclusive;
  if (data.domain !== undefined) updateData.domain = data.domain;
  if (data.typicalLevel !== undefined) updateData.typicalLevel = data.typicalLevel;
  if (data.kind !== undefined) updateData.kind = data.kind;

  return prisma.tagGroup.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTagGroup(id: string) {
  const tagCount = await prisma.tagDefinition.count({
    where: { groupId: id },
  });
  if (tagCount > 0) {
    throw new Error("Cannot delete group that contains tags. Remove or move all tags first.");
  }
  return prisma.tagGroup.delete({ where: { id } });
}

export async function reorderTagGroups(orderedIds: string[]) {
  return prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.tagGroup.update({ where: { id }, data: { sortOrder: i } }),
    ),
  );
}

// ─── Definition CRUD ────────────────────────────────────────────────────────

export async function createTagDefinition(data: {
  groupId: string;
  name: string;
  description?: string;
  parentId?: string | null;
  typicalLevel?: TagLevel | null;
}) {
  const maxOrder = await prisma.tagDefinition.aggregate({
    where: { groupId: data.groupId },
    _max: { sortOrder: true },
  });
  return prisma.tagDefinition.create({
    data: {
      groupId: data.groupId,
      name: data.name,
      slug: slugify(data.name),
      nameNorm: normalize(data.name),
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      typicalLevel: data.typicalLevel ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateTagDefinition(
  id: string,
  data: {
    name?: string;
    sortOrder?: number;
    description?: string | null;
    parentId?: string | null;
    typicalLevel?: TagLevel | null;
  },
) {
  if (data.parentId !== undefined) await assertNoCycle(id, data.parentId);
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
    updateData.nameNorm = normalize(data.name);
  }
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.parentId !== undefined) updateData.parentId = data.parentId;
  if (data.typicalLevel !== undefined) updateData.typicalLevel = data.typicalLevel;

  return prisma.tagDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTagDefinition(id: string) {
  return prisma.$transaction(async (tx) => {
    // Children move up to the deleted tag's parent, keeping their implication chain
    const doomed = await tx.tagDefinition.findUniqueOrThrow({ where: { id }, select: { parentId: true } });
    await tx.tagDefinition.updateMany({ where: { parentId: id }, data: { parentId: doomed.parentId } });
    // Delete aliases first
    await tx.tagAlias.deleteMany({ where: { tagDefinitionId: id } });
    // Delete all join table rows
    await tx.personTag.deleteMany({ where: { tagDefinitionId: id } });
    await tx.sessionTag.deleteMany({ where: { tagDefinitionId: id } });
    await tx.mediaItemTag.deleteMany({ where: { tagDefinitionId: id } });
    await tx.setTag.deleteMany({ where: { tagDefinitionId: id } });
    await tx.projectTag.deleteMany({ where: { tagDefinitionId: id } });
    return tx.tagDefinition.delete({ where: { id } });
  });
}

export async function mergeTagDefinitions(sourceIds: string[], targetId: string) {
  return prisma.$transaction(async (tx) => {
    // ── 1. Batch-fetch all source definitions (for alias creation) ──────────
    const sourceTags = await tx.tagDefinition.findMany({ where: { id: { in: sourceIds } } });

    // ── 2. Batch-fetch all entity rows for ALL sources + existing target rows ─
    const [
      sourcePersonRows, targetPersonRows,
      sourceSessionRows, targetSessionRows,
      sourceMediaRows, targetMediaRows,
      sourceSetRows, targetSetRows,
      sourceProjectRows, targetProjectRows,
    ] = await Promise.all([
      tx.personTag.findMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.personTag.findMany({ where: { tagDefinitionId: targetId } }),
      tx.sessionTag.findMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.sessionTag.findMany({ where: { tagDefinitionId: targetId } }),
      tx.mediaItemTag.findMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.mediaItemTag.findMany({ where: { tagDefinitionId: targetId } }),
      tx.setTag.findMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.setTag.findMany({ where: { tagDefinitionId: targetId } }),
      tx.projectTag.findMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.projectTag.findMany({ where: { tagDefinitionId: targetId } }),
    ]);

    // ── 3. Build conflict sets (entity IDs already tagged with target) ───────
    const existingPersonIds = new Set(targetPersonRows.map(r => r.personId));
    const existingSessionIds = new Set(targetSessionRows.map(r => r.sessionId));
    const existingMediaIds = new Set(targetMediaRows.map(r => r.mediaItemId));
    const existingSetIds = new Set(targetSetRows.map(r => r.setId));
    const existingProjectIds = new Set(targetProjectRows.map(r => r.projectId));

    // ── 4. Move non-conflicting rows to target; delete all source rows ───────
    await Promise.all([
      tx.personTag.createMany({
        data: sourcePersonRows
          .filter(r => !existingPersonIds.has(r.personId))
          .map(r => ({ personId: r.personId, tagDefinitionId: targetId, source: r.source })),
        skipDuplicates: true,
      }),
      tx.sessionTag.createMany({
        data: sourceSessionRows
          .filter(r => !existingSessionIds.has(r.sessionId))
          .map(r => ({ sessionId: r.sessionId, tagDefinitionId: targetId, source: r.source })),
        skipDuplicates: true,
      }),
      tx.mediaItemTag.createMany({
        data: sourceMediaRows
          .filter(r => !existingMediaIds.has(r.mediaItemId))
          .map(r => ({ mediaItemId: r.mediaItemId, tagDefinitionId: targetId, source: r.source })),
        skipDuplicates: true,
      }),
      tx.setTag.createMany({
        data: sourceSetRows
          .filter(r => !existingSetIds.has(r.setId))
          .map(r => ({ setId: r.setId, tagDefinitionId: targetId, source: r.source })),
        skipDuplicates: true,
      }),
      tx.projectTag.createMany({
        data: sourceProjectRows
          .filter(r => !existingProjectIds.has(r.projectId))
          .map(r => ({ projectId: r.projectId, tagDefinitionId: targetId, source: r.source })),
        skipDuplicates: true,
      }),
    ]);

    await Promise.all([
      tx.personTag.deleteMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.sessionTag.deleteMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.mediaItemTag.deleteMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.setTag.deleteMany({ where: { tagDefinitionId: { in: sourceIds } } }),
      tx.projectTag.deleteMany({ where: { tagDefinitionId: { in: sourceIds } } }),
    ]);

    // ── 5. Convert source tag names into aliases on the target ───────────────
    const candidateAliases = sourceTags.map(t => ({
      slug: slugify(t.name),
      name: t.name,
      nameNorm: normalize(t.name),
    }));
    const candidateSlugs = candidateAliases.map(a => a.slug);
    const existingAliasSlugs = new Set(
      (await tx.tagAlias.findMany({ where: { slug: { in: candidateSlugs } } })).map(a => a.slug)
    );
    const newAliases = candidateAliases.filter(a => !existingAliasSlugs.has(a.slug));
    if (newAliases.length > 0) {
      await tx.tagAlias.createMany({
        data: newAliases.map(a => ({ tagDefinitionId: targetId, name: a.name, nameNorm: a.nameNorm, slug: a.slug })),
        skipDuplicates: true,
      });
    }

    // ── 6. Children of the sources now hang under the target ─────────────────
    // Detach the target first when its own parent is a source, or it would
    // become its own parent below.
    await tx.tagDefinition.updateMany({
      where: { id: targetId, parentId: { in: sourceIds } },
      data: { parentId: null },
    });
    await tx.tagDefinition.updateMany({
      where: { parentId: { in: sourceIds } },
      data: { parentId: targetId },
    });

    // ── 7. Delete source aliases and source definitions ───────────────────────
    await tx.tagAlias.deleteMany({ where: { tagDefinitionId: { in: sourceIds } } });
    await tx.tagDefinition.deleteMany({ where: { id: { in: sourceIds } } });
  });
}

export async function reorderTagDefinitions(orderedIds: string[]) {
  return prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.tagDefinition.update({ where: { id }, data: { sortOrder: i } }),
    ),
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────

const DEFINITION_INCLUDE = {
  group: { select: GROUP_SELECT },
  aliases: { select: { name: true } },
} as const;

/** Every tag that may sit on this entity type, ranked by typical level. */
export async function getTagDefinitionsForEntity(entityType: TaggableEntity): Promise<TagDefinitionWithGroup[]> {
  const tags = await prisma.tagDefinition.findMany({
    where: { group: { domain: { in: domainsForEntity(entityType) } } },
    include: DEFINITION_INCLUDE,
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return rankForEntity(tags, entityType);
}

export async function searchTagDefinitions(
  query: string,
  entityType?: TaggableEntity,
): Promise<TagDefinitionWithGroup[]> {
  const norm = normalize(query);
  const tags = await prisma.tagDefinition.findMany({
    where: {
      OR: [
        { nameNorm: { contains: norm } },
        { aliases: { some: { nameNorm: { contains: norm } } } },
      ],
      ...(entityType ? { group: { domain: { in: domainsForEntity(entityType) } } } : {}),
    },
    include: DEFINITION_INCLUDE,
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    take: 30,
  });
  return entityType ? rankForEntity(tags, entityType) : tags;
}

// ─── Palette ────────────────────────────────────────────────────────────────

export type PaletteGroup = {
  id: string;
  name: string;
  color: string;
  isExclusive: boolean;
  kind: TagGroupKind;
  typicalLevel: TagLevel | null;
};

export type PaletteTag = TagDefinitionWithGroup & { usageCount: number };

/** How many entities (all five kinds together) carry each tag. */
export async function getTagUsageCountMap(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; cnt: bigint }>>`
    SELECT "tagDefinitionId" AS id, count(*)::bigint AS cnt FROM (
      SELECT "tagDefinitionId" FROM person_tag
      UNION ALL SELECT "tagDefinitionId" FROM session_tag
      UNION ALL SELECT "tagDefinitionId" FROM media_item_tag
      UNION ALL SELECT "tagDefinitionId" FROM set_tag
      UNION ALL SELECT "tagDefinitionId" FROM project_tag
    ) u
    GROUP BY 1
  `;
  return new Map(rows.map((r) => [r.id, Number(r.cnt)]));
}

/**
 * Everything the tag palette needs for one entity type: the groups it may use
 * (empty ones too — inline creation needs a target) and their tags with usage
 * counts. Groups whose typical level is this entity come first.
 */
export async function getTagPaletteData(
  entityType: TaggableEntity,
): Promise<{ groups: PaletteGroup[]; tags: PaletteTag[] }> {
  const [groups, tags, usage] = await Promise.all([
    prisma.tagGroup.findMany({
      where: { domain: { in: domainsForEntity(entityType) } },
      select: { id: true, name: true, color: true, isExclusive: true, kind: true, typicalLevel: true },
      orderBy: { sortOrder: "asc" },
    }),
    getTagDefinitionsForEntity(entityType),
    getTagUsageCountMap(),
  ]);
  const fits = (g: PaletteGroup) => (g.typicalLevel === entityType ? 0 : 1);
  const rankedGroups = groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => fits(a.g) - fits(b.g) || a.i - b.i)
    .map(({ g }) => g);
  return {
    groups: rankedGroups,
    tags: tags.map((t) => ({ ...t, usageCount: usage.get(t.id) ?? 0 })),
  };
}

// ─── Popular Tags ───────────────────────────────────────────────────────────

export async function getPopularTagsForEntity(
  entityType: TaggableEntity,
  limit = 10,
): Promise<TagDefinitionWithGroup[]> {
  const domains = domainsForEntity(entityType);
  // Usage across all 5 join tables for tags this entity type may carry
  const rows = await prisma.$queryRaw<Array<{ id: string; cnt: bigint }>>`
    SELECT td.id, (
      COALESCE((SELECT count(*) FROM person_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM session_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM media_item_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM set_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM project_tag WHERE "tagDefinitionId" = td.id), 0)
    )::bigint AS cnt
    FROM tag_definition td
    JOIN tag_group tg ON tg.id = td."groupId"
    WHERE tg.domain::text = ANY(${domains})
    ORDER BY cnt DESC, td."sortOrder" ASC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const tags = await prisma.tagDefinition.findMany({
    where: { id: { in: ids } },
    include: DEFINITION_INCLUDE,
  });

  // Preserve the order from the raw query
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  return ids.map((id) => tagMap.get(id)).filter((t): t is (typeof tags)[number] => t !== undefined);
}

// ─── Alias CRUD ─────────────────────────────────────────────────────────────

export async function createTagAlias(tagDefinitionId: string, name: string) {
  return prisma.tagAlias.create({
    data: {
      tagDefinitionId,
      name,
      nameNorm: normalize(name),
      slug: slugify(name),
    },
  });
}

export async function deleteTagAlias(id: string) {
  return prisma.tagAlias.delete({ where: { id } });
}

// ─── Usage Counts ───────────────────────────────────────────────────────────

export async function getTagUsageCounts(tagDefinitionIds: string[]) {
  const counts: Record<string, number> = {};
  for (const id of tagDefinitionIds) {
    const [person, session, media, set, project] = await Promise.all([
      prisma.personTag.count({ where: { tagDefinitionId: id } }),
      prisma.sessionTag.count({ where: { tagDefinitionId: id } }),
      prisma.mediaItemTag.count({ where: { tagDefinitionId: id } }),
      prisma.setTag.count({ where: { tagDefinitionId: id } }),
      prisma.projectTag.count({ where: { tagDefinitionId: id } }),
    ]);
    counts[id] = person + session + media + set + project;
  }
  return counts;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export async function getOrphanedTags(): Promise<TagDefinitionWithGroup[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT td.id
    FROM tag_definition td
    WHERE NOT EXISTS (SELECT 1 FROM person_tag WHERE "tagDefinitionId" = td.id)
      AND NOT EXISTS (SELECT 1 FROM session_tag WHERE "tagDefinitionId" = td.id)
      AND NOT EXISTS (SELECT 1 FROM media_item_tag WHERE "tagDefinitionId" = td.id)
      AND NOT EXISTS (SELECT 1 FROM set_tag WHERE "tagDefinitionId" = td.id)
      AND NOT EXISTS (SELECT 1 FROM project_tag WHERE "tagDefinitionId" = td.id)
    ORDER BY td.name ASC
  `;

  if (rows.length === 0) return [];

  return prisma.tagDefinition.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: DEFINITION_INCLUDE,
    orderBy: { name: "asc" },
  });
}

export async function getNearDuplicateTags(threshold = 0.4): Promise<NearDuplicatePair[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      a_id: string;
      a_name: string;
      a_group: string;
      b_id: string;
      b_name: string;
      b_group: string;
      sim: number;
    }>
  >`
    SELECT
      a.id AS a_id, a.name AS a_name, ga.name AS a_group,
      b.id AS b_id, b.name AS b_name, gb.name AS b_group,
      similarity(a."nameNorm", b."nameNorm") AS sim
    FROM tag_definition a
    JOIN tag_group ga ON a."groupId" = ga.id
    JOIN tag_definition b ON a.id < b.id
    JOIN tag_group gb ON b."groupId" = gb.id
    WHERE similarity(a."nameNorm", b."nameNorm") > ${threshold}
    ORDER BY sim DESC
    LIMIT 50
  `;

  return rows.map((r) => ({
    tagA: { id: r.a_id, name: r.a_name, groupName: r.a_group },
    tagB: { id: r.b_id, name: r.b_name, groupName: r.b_group },
    similarity: r.sim,
  }));
}

export async function getTagUsageBreakdown(): Promise<TagUsageBreakdown[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      group_name: string;
      group_color: string;
      person_count: bigint;
      session_count: bigint;
      media_count: bigint;
      set_count: bigint;
      project_count: bigint;
    }>
  >`
    SELECT
      td.id,
      td.name,
      tg.name AS group_name,
      tg.color AS group_color,
      COALESCE((SELECT count(*) FROM person_tag WHERE "tagDefinitionId" = td.id), 0)::bigint AS person_count,
      COALESCE((SELECT count(*) FROM session_tag WHERE "tagDefinitionId" = td.id), 0)::bigint AS session_count,
      COALESCE((SELECT count(*) FROM media_item_tag WHERE "tagDefinitionId" = td.id), 0)::bigint AS media_count,
      COALESCE((SELECT count(*) FROM set_tag WHERE "tagDefinitionId" = td.id), 0)::bigint AS set_count,
      COALESCE((SELECT count(*) FROM project_tag WHERE "tagDefinitionId" = td.id), 0)::bigint AS project_count
    FROM tag_definition td
    JOIN tag_group tg ON td."groupId" = tg.id
    ORDER BY tg."sortOrder", td."sortOrder"
  `;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    groupName: r.group_name,
    groupColor: r.group_color,
    person: Number(r.person_count),
    session: Number(r.session_count),
    media: Number(r.media_count),
    set: Number(r.set_count),
    project: Number(r.project_count),
    total:
      Number(r.person_count) +
      Number(r.session_count) +
      Number(r.media_count) +
      Number(r.set_count) +
      Number(r.project_count),
  }));
}
