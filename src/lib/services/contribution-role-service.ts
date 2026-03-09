import { prisma } from "@/lib/db";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContributionRoleGroupWithDefinitions = Awaited<
  ReturnType<typeof getAllContributionRoleGroups>
>[number];

// ─── Group CRUD ──────────────────────────────────────────────────────────────

export async function getAllContributionRoleGroups() {
  return prisma.contributionRoleGroup.findMany({
    include: {
      definitions: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createContributionRoleGroup(data: {
  name: string;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.contributionRoleGroup.aggregate({
    _max: { sortOrder: true },
  });
  return prisma.contributionRoleGroup.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateContributionRoleGroup(
  id: string,
  data: { name?: string; sortOrder?: number },
) {
  return prisma.contributionRoleGroup.update({
    where: { id },
    data,
  });
}

export async function deleteContributionRoleGroup(id: string) {
  const count = await prisma.contributionRoleDefinition.count({
    where: { groupId: id },
  });
  if (count > 0) {
    throw new Error("Cannot delete group with existing definitions");
  }
  return prisma.contributionRoleGroup.delete({ where: { id } });
}

// ─── Definition CRUD ─────────────────────────────────────────────────────────

export async function createContributionRoleDefinition(data: {
  groupId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.contributionRoleDefinition.aggregate({
    _max: { sortOrder: true },
    where: { groupId: data.groupId },
  });
  return prisma.contributionRoleDefinition.create({
    data: {
      groupId: data.groupId,
      name: data.name,
      slug: slugify(data.name),
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateContributionRoleDefinition(
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
  return prisma.contributionRoleDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteContributionRoleDefinition(id: string) {
  const contributionCount = await prisma.sessionContribution.count({
    where: { roleDefinitionId: id },
  });
  if (contributionCount > 0) {
    throw new Error("Cannot delete role that is in use by contributions");
  }
  const creditCount = await prisma.setCreditRaw.count({
    where: { roleDefinitionId: id },
  });
  if (creditCount > 0) {
    throw new Error("Cannot delete role that is in use by set credits");
  }
  return prisma.contributionRoleDefinition.delete({ where: { id } });
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

export async function reorderContributionRoleGroups(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.contributionRoleGroup.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}

export async function reorderContributionRoleDefinitions(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.contributionRoleDefinition.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}
