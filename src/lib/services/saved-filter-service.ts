import { prisma } from "@/lib/db";
import type { GalleryItem } from "@/lib/types";
import { addToCollection, createCollection } from "./collection-service";
import { getMediaGalleryItemsByIds } from "./media-service";
import { findTagMatchIds, resolveTagFilterParam } from "./tag-filter-service";

// Saved filters (ADR-0033, S6). One primitive for every browser: a named set
// of URL parameters. Scope "media" is a Smart Collection — its `tags=` query
// is evaluated live against the whole image library, never stored as members.

export type SavedFilterScope = "people" | "sets" | "sessions" | "media";

export const SAVED_FILTER_SCOPES: readonly SavedFilterScope[] = ["people", "sets", "sessions", "media"];

export type SavedFilterRow = {
  id: string;
  scope: SavedFilterScope;
  name: string;
  params: string;
  pinned: boolean;
};

const SELECT = { id: true, scope: true, name: true, params: true, pinned: true } as const;

function toRow(r: { id: string; scope: string; name: string; params: string; pinned: boolean }): SavedFilterRow {
  return { ...r, scope: r.scope as SavedFilterScope };
}

export async function listSavedFilters(scope: SavedFilterScope): Promise<SavedFilterRow[]> {
  const rows = await prisma.savedFilter.findMany({
    where: { scope },
    orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: SELECT,
  });
  return rows.map(toRow);
}

export async function getSavedFilter(id: string): Promise<SavedFilterRow | null> {
  const r = await prisma.savedFilter.findUnique({ where: { id }, select: SELECT });
  return r ? toRow(r) : null;
}

/** Strip paging/transient params; what remains is the view */
export function normaliseParams(params: string): string {
  const p = new URLSearchParams(params.replace(/^\?/, ""));
  p.delete("loaded");
  return p.toString();
}

export async function createSavedFilter(scope: SavedFilterScope, name: string, params: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required");
  const exists = await prisma.savedFilter.findUnique({ where: { scope_name: { scope, name: trimmed } } });
  if (exists) throw new Error(`“${trimmed}” already exists`);
  const max = await prisma.savedFilter.aggregate({ where: { scope }, _max: { sortOrder: true } });
  const row = await prisma.savedFilter.create({
    data: { scope, name: trimmed, params: normaliseParams(params), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  return row.id;
}

export async function updateSavedFilter(id: string, data: { name?: string; params?: string; pinned?: boolean }): Promise<void> {
  await prisma.savedFilter.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.params !== undefined ? { params: normaliseParams(data.params) } : {}),
      ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
    },
  });
}

export async function deleteSavedFilter(id: string): Promise<void> {
  await prisma.savedFilter.delete({ where: { id } });
}

/**
 * One-time import of the views a browser kept in localStorage before S6.
 * Same-named views already in the DB are skipped. Returns how many were added.
 */
export async function importSavedFilters(
  scope: SavedFilterScope,
  views: { name: string; params: string }[],
): Promise<number> {
  let added = 0;
  for (const v of views) {
    const name = v.name.trim();
    if (!name) continue;
    const exists = await prisma.savedFilter.findUnique({ where: { scope_name: { scope, name } } });
    if (exists) continue;
    await createSavedFilter(scope, name, v.params);
    added++;
  }
  return added;
}

// ─── Smart Collections ───────────────────────────────────────────────────────

/** The `tags=` query of a smart collection */
export function smartQueryText(row: Pick<SavedFilterRow, "params">): string {
  return new URLSearchParams(row.params).get("tags") ?? "";
}

export type SmartCollectionResult = {
  ids: string[];
  problems: string[];
};

/** Live members of a smart collection query (all matching images) */
export async function evaluateSmartQuery(text: string): Promise<SmartCollectionResult> {
  const filter = await resolveTagFilterParam(text, "MEDIA_ITEM");
  if (!filter) return { ids: [], problems: [] };
  return { ids: await findTagMatchIds("MEDIA_ITEM", filter.resolved), problems: filter.problems };
}

export type SmartCollectionSummary = SavedFilterRow & { query: string; count: number };

export async function getSmartCollections(): Promise<SmartCollectionSummary[]> {
  const rows = await listSavedFilters("media");
  return Promise.all(
    rows.map(async (r) => {
      const query = smartQueryText(r);
      const { ids } = await evaluateSmartQuery(query);
      return { ...r, query, count: ids.length };
    }),
  );
}

/** Images shown on a smart collection's page — newest first, capped */
export const SMART_COLLECTION_SHOWN = 1000;

export async function getSmartCollectionGallery(
  text: string,
): Promise<{ items: GalleryItem[]; total: number; problems: string[] }> {
  const { ids, problems } = await evaluateSmartQuery(text);
  if (ids.length === 0) return { items: [], total: 0, problems };
  // Newest first, then cap — order by creation before slicing
  const newest = await prisma.mediaItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: SMART_COLLECTION_SHOWN,
  });
  return { items: await getMediaGalleryItemsByIds(newest.map((m) => m.id)), total: ids.length, problems };
}

/**
 * Freeze a smart collection: a static collection holding today's matches
 * (all of them, not just the shown cap). The smart collection stays.
 */
export async function freezeSmartCollection(id: string, name: string): Promise<{ collectionId: string; count: number }> {
  const row = await getSavedFilter(id);
  if (!row || row.scope !== "media") throw new Error("Not a smart collection");
  const { ids } = await evaluateSmartQuery(smartQueryText(row));
  const collectionId = await createCollection({ name: name.trim() || `${row.name} (frozen)` });
  await addToCollection(collectionId, ids);
  return { collectionId, count: ids.length };
}
