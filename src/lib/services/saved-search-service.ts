import { prisma } from "@/lib/db";
import type { FilterSpec } from "@/lib/types/filter-spec";

export type SavedSearchSummary = {
  id: string;
  name: string;
  scope: string;
  pinned: boolean;
  filterSpec: FilterSpec;
  createdAt: Date;
  updatedAt: Date;
};

export async function listSavedSearches(scope: string): Promise<SavedSearchSummary[]> {
  const rows = await prisma.savedSearch.findMany({
    where: { scope },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope,
    pinned: r.pinned,
    filterSpec: r.filterSpec as unknown as FilterSpec,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function createSavedSearch(input: {
  name: string;
  scope: string;
  filterSpec: FilterSpec;
}): Promise<string> {
  const row = await prisma.savedSearch.create({
    data: {
      name: input.name.trim(),
      scope: input.scope,
      filterSpec: input.filterSpec as unknown as object,
    },
  });
  return row.id;
}

export async function renameSavedSearch(id: string, name: string): Promise<void> {
  await prisma.savedSearch.update({
    where: { id },
    data: { name: name.trim() },
  });
}

export async function updateSavedSearchSpec(id: string, filterSpec: FilterSpec): Promise<void> {
  await prisma.savedSearch.update({
    where: { id },
    data: { filterSpec: filterSpec as unknown as object },
  });
}

export async function togglePinSavedSearch(id: string, pinned: boolean): Promise<void> {
  await prisma.savedSearch.update({
    where: { id },
    data: { pinned },
  });
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await prisma.savedSearch.delete({ where: { id } });
}
