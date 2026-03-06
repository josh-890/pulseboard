import { prisma } from "@/lib/db";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type SkillGroupWithDefinitions = Awaited<
  ReturnType<typeof getAllSkillGroups>
>[number];

// ─── Group CRUD ──────────────────────────────────────────────────────────────

export async function getAllSkillGroups() {
  return prisma.skillGroup.findMany({
    include: {
      definitions: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createSkillGroup(data: {
  name: string;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.skillGroup.aggregate({
    _max: { sortOrder: true },
  });
  return prisma.skillGroup.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateSkillGroup(
  id: string,
  data: { name?: string; sortOrder?: number },
) {
  return prisma.skillGroup.update({
    where: { id },
    data,
  });
}

export async function deleteSkillGroup(id: string) {
  const count = await prisma.skillDefinition.count({
    where: { groupId: id },
  });
  if (count > 0) {
    throw new Error("Cannot delete group with existing definitions");
  }
  return prisma.skillGroup.delete({ where: { id } });
}

// ─── Definition CRUD ─────────────────────────────────────────────────────────

export async function createSkillDefinition(data: {
  groupId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.skillDefinition.aggregate({
    _max: { sortOrder: true },
    where: { groupId: data.groupId },
  });
  return prisma.skillDefinition.create({
    data: {
      groupId: data.groupId,
      name: data.name,
      slug: slugify(data.name),
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateSkillDefinition(
  id: string,
  data: { name?: string; description?: string | null; sortOrder?: number },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.description !== undefined) updateData.description = data.description;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  return prisma.skillDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteSkillDefinition(id: string) {
  // Check if any PersonSkill references this definition
  const count = await prisma.personSkill.count({
    where: { skillDefinitionId: id },
  });
  if (count > 0) {
    throw new Error("Cannot delete definition that is in use by person skills");
  }
  // Also check SessionParticipantSkill
  const spsCount = await prisma.sessionParticipantSkill.count({
    where: { skillDefinitionId: id },
  });
  if (spsCount > 0) {
    throw new Error(
      "Cannot delete definition that is in use by session participant skills",
    );
  }
  return prisma.skillDefinition.delete({ where: { id } });
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

export async function reorderSkillGroups(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.skillGroup.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}

export async function reorderSkillDefinitions(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.skillDefinition.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}
