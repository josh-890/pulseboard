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
  scope: string[];
  sortOrder: number;
  group: { id: string; name: string; slug: string; color: string };
};

// ─── Group CRUD ─────────────────────────────────────────────────────────────

export async function getAllTagGroups() {
  return prisma.tagGroup.findMany({
    include: {
      tags: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createTagGroup(data: {
  name: string;
  color?: string;
  description?: string;
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
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateTagGroup(
  id: string,
  data: { name?: string; color?: string; description?: string | null },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.color !== undefined) updateData.color = data.color;
  if (data.description !== undefined) updateData.description = data.description;

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
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateTagDefinition(
  id: string,
  data: { name?: string; scope?: string[]; sortOrder?: number },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
    updateData.nameNorm = normalize(data.name);
  }
  if (data.scope !== undefined) updateData.scope = data.scope;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

  return prisma.tagDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTagDefinition(id: string) {
  return prisma.$transaction(async (tx) => {
    // Delete all join table rows first
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
    // For each join table, move rows from sources to target (skip duplicates)
    for (const sourceId of sourceIds) {
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

      // Delete source tag definition
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

export async function getTagDefinitionsForScope(scope: string) {
  return prisma.tagDefinition.findMany({
    where: { scope: { has: scope } },
    include: {
      group: { select: { id: true, name: true, slug: true, color: true } },
    },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
}

export async function searchTagDefinitions(query: string, scope?: string) {
  const norm = normalize(query);
  return prisma.tagDefinition.findMany({
    where: {
      nameNorm: { contains: norm },
      ...(scope ? { scope: { has: scope } } : {}),
    },
    include: {
      group: { select: { id: true, name: true, slug: true, color: true } },
    },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    take: 30,
  });
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
