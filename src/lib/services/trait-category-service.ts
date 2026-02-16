import { prisma } from "@/lib/db";
import type { TraitCategory } from "@/lib/types";

export async function getTraitCategories(): Promise<TraitCategory[]> {
  return prisma.traitCategory.findMany({ orderBy: { name: "asc" } });
}

export async function getTraitCategoryById(
  id: string,
): Promise<TraitCategory | null> {
  return prisma.traitCategory.findUnique({ where: { id } });
}

export async function createTraitCategory(data: {
  name: string;
  description?: string;
  icon?: string;
}): Promise<TraitCategory> {
  return prisma.traitCategory.create({ data });
}

export async function updateTraitCategory(
  id: string,
  data: { name?: string; description?: string; icon?: string },
): Promise<TraitCategory> {
  return prisma.traitCategory.update({ where: { id }, data });
}

export async function deleteTraitCategory(id: string): Promise<TraitCategory> {
  return prisma.traitCategory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
