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
  // Block if any category in the group has entityModel (system category)
  const systemCount = await prisma.mediaCategory.count({
    where: { groupId: id, entityModel: { not: null } },
  });
  if (systemCount > 0) {
    throw new Error("Cannot delete group containing system categories");
  }
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
  // Prevent clearing entityModel on system categories
  if (data.entityModel !== undefined) {
    const existing = await prisma.mediaCategory.findUniqueOrThrow({ where: { id } });
    if (existing.entityModel && !data.entityModel) {
      throw new Error("Cannot remove entity model from system category");
    }
  }
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
  // Block deletion of system categories (those with entityModel set)
  const cat = await prisma.mediaCategory.findUniqueOrThrow({ where: { id } });
  if (cat.entityModel) {
    throw new Error("Cannot delete system category");
  }
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
      bodyMarkId: true,
      bodyModificationId: true,
      cosmeticProcedureId: true,
      category: { select: { entityModel: true } },
    },
  });

  const counts = new Map<string, number>();
  for (const link of links) {
    if (!link.categoryId) continue;

    // Skip orphaned links: category requires an entity but none is set
    const em = link.category?.entityModel;
    if (em === "BodyMark" && !link.bodyMarkId) continue;
    if (em === "BodyModification" && !link.bodyModificationId) continue;
    if (em === "CosmeticProcedure" && !link.cosmeticProcedureId) continue;

    counts.set(link.categoryId, (counts.get(link.categoryId) ?? 0) + 1);
  }

  return counts;
}

// ─── System category auto-ensure ────────────────────────────────────────────

const SYSTEM_CATEGORIES = [
  {
    groupName: "Body Marks",
    categories: [
      { name: "Tattoos", slug: "tattoos", entityModel: "BodyMark" },
      { name: "Scars", slug: "scars", entityModel: "BodyMark" },
      { name: "Birthmarks", slug: "birthmarks", entityModel: "BodyMark" },
    ],
  },
  {
    groupName: "Body Modifications",
    categories: [
      { name: "Piercings", slug: "piercings", entityModel: "BodyModification" },
      { name: "Implants", slug: "implants", entityModel: "BodyModification" },
      { name: "Brandings", slug: "brandings", entityModel: "BodyModification" },
    ],
  },
  {
    groupName: "Cosmetic Procedures",
    categories: [
      { name: "Breast", slug: "breast", entityModel: "CosmeticProcedure" },
      { name: "Rhinoplasty", slug: "rhinoplasty", entityModel: "CosmeticProcedure" },
      { name: "Lip Fillers", slug: "lip-fillers", entityModel: "CosmeticProcedure" },
    ],
  },
] as const;

/**
 * Ensure that at least one category exists for each entity model.
 * Idempotent — safe to call on every page load.
 */
export async function ensureEntityCategories(): Promise<void> {
  const required = ["BodyMark", "BodyModification", "CosmeticProcedure"];
  const existing = await prisma.mediaCategory.groupBy({
    by: ["entityModel"],
    where: { entityModel: { in: required } },
  });
  const existingModels = new Set(existing.map((e) => e.entityModel));
  const missing = required.filter((m) => !existingModels.has(m));
  if (missing.length === 0) return;

  // Get max sortOrder for groups
  const maxGroupOrder = await prisma.mediaCategoryGroup.aggregate({
    _max: { sortOrder: true },
  });
  let nextGroupOrder = (maxGroupOrder._max.sortOrder ?? 0) + 1;

  for (const groupDef of SYSTEM_CATEGORIES) {
    const neededCats = groupDef.categories.filter((c) => missing.includes(c.entityModel));
    if (neededCats.length === 0) continue;

    // Try to find existing group by name
    let group = await prisma.mediaCategoryGroup.findFirst({
      where: { name: groupDef.groupName },
    });
    if (!group) {
      group = await prisma.mediaCategoryGroup.create({
        data: { name: groupDef.groupName, sortOrder: nextGroupOrder++ },
      });
    }

    const maxCatOrder = await prisma.mediaCategory.aggregate({
      _max: { sortOrder: true },
      where: { groupId: group.id },
    });
    let nextCatOrder = (maxCatOrder._max.sortOrder ?? 0) + 1;

    for (const catDef of neededCats) {
      await prisma.mediaCategory.create({
        data: {
          groupId: group.id,
          name: catDef.name,
          slug: catDef.slug,
          entityModel: catDef.entityModel,
          sortOrder: nextCatOrder++,
        },
      });
    }
  }
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
