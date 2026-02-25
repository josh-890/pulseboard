import { Suspense } from "react";
import { ImageIcon } from "lucide-react";
import { getSetsPaginated, getChannelsWithLabelMaps } from "@/lib/services/set-service";
import { getFavoritePhotosForSets } from "@/lib/services/photo-service";
import type { SetType } from "@/lib/types";
import { SetGrid } from "@/components/sets/set-grid";
import { SetSearch } from "@/components/sets/set-search";
import { TypeFilter } from "@/components/sets/type-filter";
import { AddSetSheet } from "@/components/sets/add-set-sheet";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_LOADED = 500;

type SetsPageProps = {
  searchParams: Promise<{ q?: string; type?: string; loaded?: string }>;
};

const VALID_TYPES = new Set<string>(["photo", "video"]);

function isSetType(value: string): value is SetType {
  return VALID_TYPES.has(value);
}

export default async function SetsPage({ searchParams }: SetsPageProps) {
  const { q, type, loaded } = await searchParams;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const resolvedType = type && isSetType(type) ? type : undefined;

  const filters = {
    q: q?.trim() || undefined,
    type: resolvedType ?? ("all" as const),
  };

  const [paginated, channels] = await Promise.all([
    getSetsPaginated(filters, undefined, limit),
    getChannelsWithLabelMaps(),
  ]);

  // Batch-load thumbnail photos for initial chunk
  const photoMapRaw = await getFavoritePhotosForSets(paginated.items.map((s) => s.id));
  const photoMap = Object.fromEntries(photoMapRaw);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <ImageIcon size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Sets</h1>
            <p className="text-sm text-muted-foreground">
              {paginated.totalCount} {paginated.totalCount === 1 ? "set" : "sets"}
            </p>
          </div>
        </div>
        <AddSetSheet channels={channels} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <SetSearch />
          </Suspense>
        </div>
        <Suspense>
          <TypeFilter />
        </Suspense>
      </div>

      {/* Grid */}
      <SetGrid
        sets={paginated.items}
        photoMap={photoMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
      />
    </div>
  );
}
