import { Suspense } from "react";
import Link from "next/link";
import { Library, Heart, Star, ImageIcon } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getAllCollections, type CollectionSummary } from "@/lib/services/collection-service";
import { countFavoriteMediaItems } from "@/lib/services/media-service";
import { AddCollectionDialog } from "@/components/collections/add-collection-dialog";
import { CollectionCard } from "@/components/collections/collection-card";
import { BrowserToolbar, type BrowserToolbarConfig, type FilterGroup } from "@/components/shared/browser-toolbar";

export const dynamic = "force-dynamic";

type Filters = { q?: string; type?: string; layout?: string; person?: string; nonEmpty?: boolean };

function applyFilters(
  list: CollectionSummary[],
  f: Filters,
  exclude?: "type" | "layout" | "person",
): CollectionSummary[] {
  return list.filter((c) => {
    if (f.q && !c.name.toLowerCase().includes(f.q.toLowerCase())) return false;
    if (exclude !== "type" && f.type === "global" && c.personId) return false;
    if (exclude !== "type" && f.type === "person" && !c.personId) return false;
    if (exclude !== "layout" && f.layout === "grid" && c.layout !== "GRID") return false;
    if (exclude !== "layout" && f.layout === "before-after" && c.layout !== "SIDE_BY_SIDE") return false;
    if (exclude !== "person" && f.person && c.personId !== f.person) return false;
    if (f.nonEmpty && c.itemCount === 0) return false;
    return true;
  });
}

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "items-desc", label: "Most items" },
];

function sortCollections(list: CollectionSummary[], sort: string): CollectionSummary[] {
  const out = [...list];
  switch (sort) {
    case "created":
      out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
    case "name-asc":
      out.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "items-desc":
      out.sort((a, b) => b.itemCount - a.itemCount);
      break;
    default: // "updated"
      out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  return out;
}

type CollectionsPageProps = {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    type?: string;
    layout?: string;
    person?: string;
    nonEmpty?: string;
  }>;
};

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  return withTenantFromHeaders(async () => {
    const sp = await searchParams;
    const f: Filters = {
      q: sp.q?.trim() || undefined,
      type: sp.type,
      layout: sp.layout,
      person: sp.person,
      nonEmpty: sp.nonEmpty === "true" || undefined,
    };
    const sort = sp.sort || "updated";

    const [all, favoriteCount] = await Promise.all([
      getAllCollections(),
      countFavoriteMediaItems(),
    ]);

    const target = all.find((c) => c.isTarget) ?? null;

    // Filter + sort (in-memory; collections are a small set).
    const filtered = sortCollections(applyFilters(all, f), sort);
    // The target is surfaced in the smart row, not the grid.
    const gridItems = filtered.filter((c) => !c.isTarget);

    // Person facet options + counts (over the set filtered by everything except person).
    const personBase = applyFilters(all, f, "person");
    const personCounts = new Map<string, { name: string; count: number }>();
    for (const c of personBase) {
      if (!c.personId) continue;
      const entry = personCounts.get(c.personId) ?? { name: c.personName ?? "Unknown", count: 0 };
      entry.count += 1;
      personCounts.set(c.personId, entry);
    }

    const filterGroups: FilterGroup[] = [
      {
        type: "pill",
        param: "type",
        label: "Type",
        defaultValue: "all",
        options: [
          { value: "all", label: "All" },
          { value: "global", label: "Global" },
          { value: "person", label: "Person" },
        ],
      },
      {
        type: "pill",
        param: "layout",
        label: "Layout",
        defaultValue: "all",
        options: [
          { value: "all", label: "All" },
          { value: "grid", label: "Grid" },
          { value: "before-after", label: "Before/after" },
        ],
      },
      {
        type: "facet",
        param: "person",
        label: "Person",
        searchable: true,
        options: Array.from(personCounts.entries())
          .map(([id, { name, count }]) => ({ value: id, label: name, count }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      { type: "toggle", param: "nonEmpty", label: "Non-empty" },
    ];

    const toolbarConfig: BrowserToolbarConfig = {
      basePath: "/collections",
      searchPlaceholder: "Search collections…",
      sortOptions: SORT_OPTIONS,
      defaultSort: "updated",
      filterGroups,
      resultCount: gridItems.length,
      totalCount: all.length,
    };

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-collection/15">
              <Library size={20} className="text-entity-collection" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Collections</h1>
              <p className="text-sm text-muted-foreground">
                {all.length} collection{all.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <AddCollectionDialog />
        </div>

        {/* Smart row — Favorites virtual album + ★ target collection */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/favorites"
            className="group flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 transition-colors hover:border-red-500/40"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/15">
              <Heart size={16} className="text-red-400" fill="currentColor" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight group-hover:text-primary">Favorites</div>
              <div className="text-xs text-muted-foreground">{favoriteCount} image{favoriteCount !== 1 ? "s" : ""}</div>
            </div>
          </Link>
          {target && (
            <Link
              href={`/collections/${target.id}`}
              className="group flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 transition-colors hover:border-amber-400/50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/15">
                <Star size={16} className="text-amber-400" fill="currentColor" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight group-hover:text-primary">{target.name}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ImageIcon size={11} /> {target.itemCount} · quick-add target
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* Toolbar */}
        <Suspense>
          <BrowserToolbar config={toolbarConfig} />
        </Suspense>

        {/* Grid */}
        {gridItems.length === 0 ? (
          <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
            <Library size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {all.length === 0
                ? "No collections yet. Create one to curate media across sessions and people."
                : "No collections match your filters."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gridItems.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        )}
      </div>
    );
  });
}
