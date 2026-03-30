import { prisma } from "@/lib/db";

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
  status: string;
  description: string | null;
  scope: string[];
  sortOrder: number;
  group: { id: string; name: string; slug: string; color: string; isExclusive: boolean };
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

const GROUP_SELECT = { id: true, name: true, slug: true, color: true, isExclusive: true } as const;

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

export async function createTagGroup(data: {
  name: string;
  color?: string;
  description?: string;
  isExclusive?: boolean;
}) {
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
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateTagGroup(
  id: string,
  data: { name?: string; color?: string; description?: string | null; isExclusive?: boolean },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.color !== undefined) updateData.color = data.color;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isExclusive !== undefined) updateData.isExclusive = data.isExclusive;

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
  scope?: string[];
  description?: string;
  status?: string;
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
      scope: data.scope ?? ["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"],
      description: data.description ?? null,
      status: data.status ?? "active",
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateTagDefinition(
  id: string,
  data: { name?: string; scope?: string[]; sortOrder?: number; description?: string | null; status?: string },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
    updateData.nameNorm = normalize(data.name);
  }
  if (data.scope !== undefined) updateData.scope = data.scope;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;

  return prisma.tagDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTagDefinition(id: string) {
  return prisma.$transaction(async (tx) => {
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
    for (const sourceId of sourceIds) {
      // Convert source tag name into an alias of the target
      const sourceTag = await tx.tagDefinition.findUnique({ where: { id: sourceId } });
      if (sourceTag) {
        const aliasSlug = slugify(sourceTag.name);
        const existing = await tx.tagAlias.findUnique({ where: { slug: aliasSlug } });
        if (!existing) {
          await tx.tagAlias.create({
            data: {
              tagDefinitionId: targetId,
              name: sourceTag.name,
              nameNorm: normalize(sourceTag.name),
              slug: aliasSlug,
            },
          });
        }
      }

      // PersonTag
      const personRows = await tx.personTag.findMany({ where: { tagDefinitionId: sourceId } });
      for (const row of personRows) {
        await tx.personTag.upsert({
          where: { personId_tagDefinitionId: { personId: row.personId, tagDefinitionId: targetId } },
          create: { personId: row.personId, tagDefinitionId: targetId, source: row.source },
          update: {},
        });
      }
      await tx.personTag.deleteMany({ where: { tagDefinitionId: sourceId } });

      // SessionTag
      const sessionRows = await tx.sessionTag.findMany({ where: { tagDefinitionId: sourceId } });
      for (const row of sessionRows) {
        await tx.sessionTag.upsert({
          where: { sessionId_tagDefinitionId: { sessionId: row.sessionId, tagDefinitionId: targetId } },
          create: { sessionId: row.sessionId, tagDefinitionId: targetId, source: row.source },
          update: {},
        });
      }
      await tx.sessionTag.deleteMany({ where: { tagDefinitionId: sourceId } });

      // MediaItemTag
      const mediaRows = await tx.mediaItemTag.findMany({ where: { tagDefinitionId: sourceId } });
      for (const row of mediaRows) {
        await tx.mediaItemTag.upsert({
          where: { mediaItemId_tagDefinitionId: { mediaItemId: row.mediaItemId, tagDefinitionId: targetId } },
          create: { mediaItemId: row.mediaItemId, tagDefinitionId: targetId, source: row.source },
          update: {},
        });
      }
      await tx.mediaItemTag.deleteMany({ where: { tagDefinitionId: sourceId } });

      // SetTag
      const setRows = await tx.setTag.findMany({ where: { tagDefinitionId: sourceId } });
      for (const row of setRows) {
        await tx.setTag.upsert({
          where: { setId_tagDefinitionId: { setId: row.setId, tagDefinitionId: targetId } },
          create: { setId: row.setId, tagDefinitionId: targetId, source: row.source },
          update: {},
        });
      }
      await tx.setTag.deleteMany({ where: { tagDefinitionId: sourceId } });

      // ProjectTag
      const projectRows = await tx.projectTag.findMany({ where: { tagDefinitionId: sourceId } });
      for (const row of projectRows) {
        await tx.projectTag.upsert({
          where: { projectId_tagDefinitionId: { projectId: row.projectId, tagDefinitionId: targetId } },
          create: { projectId: row.projectId, tagDefinitionId: targetId, source: row.source },
          update: {},
        });
      }
      await tx.projectTag.deleteMany({ where: { tagDefinitionId: sourceId } });

      // Delete source aliases and tag definition
      await tx.tagAlias.deleteMany({ where: { tagDefinitionId: sourceId } });
      await tx.tagDefinition.delete({ where: { id: sourceId } });
    }
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

export async function getTagDefinitionsForScope(scope: string): Promise<TagDefinitionWithGroup[]> {
  return prisma.tagDefinition.findMany({
    where: { scope: { has: scope } },
    include: {
      group: { select: GROUP_SELECT },
      aliases: { select: { name: true } },
    },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
}

export async function searchTagDefinitions(query: string, scope?: string): Promise<TagDefinitionWithGroup[]> {
  const norm = normalize(query);
  return prisma.tagDefinition.findMany({
    where: {
      OR: [
        { nameNorm: { contains: norm } },
        { aliases: { some: { nameNorm: { contains: norm } } } },
      ],
      ...(scope ? { scope: { has: scope } } : {}),
    },
    include: {
      group: { select: GROUP_SELECT },
      aliases: { select: { name: true } },
    },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    take: 30,
  });
}

// ─── Popular Tags ───────────────────────────────────────────────────────────

export async function getPopularTagsForScope(scope: string, limit = 10): Promise<TagDefinitionWithGroup[]> {
  // Raw SQL to count usage across all 5 join tables for tags in this scope
  const rows = await prisma.$queryRaw<Array<{ id: string; cnt: bigint }>>`
    SELECT td.id, (
      COALESCE((SELECT count(*) FROM person_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM session_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM media_item_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM set_tag WHERE "tagDefinitionId" = td.id), 0) +
      COALESCE((SELECT count(*) FROM project_tag WHERE "tagDefinitionId" = td.id), 0)
    )::bigint AS cnt
    FROM tag_definition td
    WHERE ${scope} = ANY(td.scope)
    ORDER BY cnt DESC, td."sortOrder" ASC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const tags = await prisma.tagDefinition.findMany({
    where: { id: { in: ids } },
    include: {
      group: { select: GROUP_SELECT },
      aliases: { select: { name: true } },
    },
  });

  // Preserve the order from the raw query
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  return ids.map((id) => tagMap.get(id)).filter(Boolean) as TagDefinitionWithGroup[];
}

// ─── Governance ─────────────────────────────────────────────────────────────

export async function getPendingTags() {
  return prisma.tagDefinition.findMany({
    where: { status: "pending" },
    include: {
      group: { select: GROUP_SELECT },
      aliases: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function approveTag(id: string) {
  return prisma.tagDefinition.update({
    where: { id },
    data: { status: "active" },
  });
}

export async function rejectTag(id: string) {
  return deleteTagDefinition(id);
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
    include: {
      group: { select: GROUP_SELECT },
      aliases: { select: { name: true } },
    },
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
