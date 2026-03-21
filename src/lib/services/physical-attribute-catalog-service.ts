import { prisma } from "@/lib/db";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PhysicalAttributeGroupWithDefinitions = Awaited<
  ReturnType<typeof getAllPhysicalAttributeGroups>
>[number];

// ─── Group CRUD ──────────────────────────────────────────────────────────────

export async function getAllPhysicalAttributeGroups() {
  return prisma.physicalAttributeGroup.findMany({
    include: {
      definitions: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createPhysicalAttributeGroup(data: {
  name: string;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.physicalAttributeGroup.aggregate({
    _max: { sortOrder: true },
  });
  return prisma.physicalAttributeGroup.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updatePhysicalAttributeGroup(
  id: string,
  data: { name?: string; sortOrder?: number },
) {
  return prisma.physicalAttributeGroup.update({
    where: { id },
    data,
  });
}

export async function deletePhysicalAttributeGroup(id: string) {
  const count = await prisma.physicalAttributeDefinition.count({
    where: { groupId: id },
  });
  if (count > 0) {
    throw new Error("Cannot delete group with existing definitions");
  }
  return prisma.physicalAttributeGroup.delete({ where: { id } });
}

// ─── Definition CRUD ─────────────────────────────────────────────────────────

export async function createPhysicalAttributeDefinition(data: {
  groupId: string;
  name: string;
  unit?: string | null;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.physicalAttributeDefinition.aggregate({
    _max: { sortOrder: true },
    where: { groupId: data.groupId },
  });
  return prisma.physicalAttributeDefinition.create({
    data: {
      groupId: data.groupId,
      name: data.name,
      slug: slugify(data.name),
      unit: data.unit ?? null,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updatePhysicalAttributeDefinition(
  id: string,
  data: { name?: string; unit?: string | null; sortOrder?: number },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  return prisma.physicalAttributeDefinition.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePhysicalAttributeDefinition(id: string) {
  const [attrCount, procCount] = await Promise.all([
    prisma.personaPhysicalAttribute.count({
      where: { attributeDefinitionId: id },
    }),
    prisma.cosmeticProcedure.count({
      where: { attributeDefinitionId: id },
    }),
  ]);
  if (attrCount > 0) {
    throw new Error(
      "Cannot delete definition that is in use by persona physical attributes",
    );
  }
  if (procCount > 0) {
    throw new Error(
      "Cannot delete definition that is linked to cosmetic procedures",
    );
  }
  return prisma.physicalAttributeDefinition.delete({ where: { id } });
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

export async function reorderPhysicalAttributeGroups(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.physicalAttributeGroup.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}

export async function reorderPhysicalAttributeDefinitions(
  orderedIds: string[],
) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.physicalAttributeDefinition.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}
