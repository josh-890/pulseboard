import { prisma } from "@/lib/db";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Group CRUD ──────────────────────────────────────────────────────────────

export async function getAllCategoryGroups() {
  return prisma.mediaCategoryGroup.findMany({
    include: {
      categories: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export type CategoryGroupWithCategories = Awaited<
  ReturnType<typeof getAllCategoryGroups>
>[number];

export async function createCategoryGroup(data: {
  name: string;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.mediaCategoryGroup.aggregate({
    _max: { sortOrder: true },
  });
  return prisma.mediaCategoryGroup.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateCategoryGroup(
  id: string,
  data: { name?: string; sortOrder?: number },
) {
  return prisma.mediaCategoryGroup.update({
    where: { id },
    data,
  });
}

export async function deleteCategoryGroup(id: string) {
  // Only allow if no categories exist
  const count = await prisma.mediaCategory.count({ where: { groupId: id } });
  if (count > 0) {
    throw new Error("Cannot delete group with existing categories");
  }
  return prisma.mediaCategoryGroup.delete({ where: { id } });
}

// ─── Category CRUD ───────────────────────────────────────────────────────────

export async function createCategory(data: {
  groupId: string;
  name: string;
  entityModel?: string | null;
  sortOrder?: number;
}) {
  const maxOrder = await prisma.mediaCategory.aggregate({
    _max: { sortOrder: true },
    where: { groupId: data.groupId },
  });
  return prisma.mediaCategory.create({
    data: {
      groupId: data.groupId,
      name: data.name,
      slug: slugify(data.name),
      entityModel: data.entityModel ?? null,
      sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateCategory(
  id: string,
  data: { name?: string; entityModel?: string | null; sortOrder?: number },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.entityModel !== undefined) updateData.entityModel = data.entityModel;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  return prisma.mediaCategory.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteCategory(id: string) {
  // Clear categoryId from any links referencing this category
  await prisma.personMediaLink.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });
  return prisma.mediaCategory.delete({ where: { id } });
}

// ─── Reorder ─────────────────────────────────────────────────────────────────

export async function reorderCategoryGroups(
  orderedIds: string[],
) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.mediaCategoryGroup.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}

export async function reorderCategories(
  orderedIds: string[],
) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.mediaCategory.update({
        where: { id },
        data: { sortOrder: i + 1 },
      }),
    ),
  );
}

// ─── Person category queries ─────────────────────────────────────────────────

export async function getPopulatedCategoriesForPerson(personId: string) {
  const links = await prisma.personMediaLink.findMany({
    where: {
      personId,
      usage: "DETAIL",
      categoryId: { not: null },
    },
    select: {
      categoryId: true,
    },
  });

  const counts = new Map<string, number>();
  for (const link of links) {
    if (link.categoryId) {
      counts.set(link.categoryId, (counts.get(link.categoryId) ?? 0) + 1);
    }
  }

  return counts;
}

export async function getCategoryMediaForPerson(
  personId: string,
  categoryId: string,
) {
  return prisma.personMediaLink.findMany({
    where: {
      personId,
      usage: "DETAIL",
      categoryId,
    },
    include: {
      mediaItem: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}
