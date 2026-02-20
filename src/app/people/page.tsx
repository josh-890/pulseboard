import { Suspense } from "react";
import { Users } from "lucide-react";
import {
  getPersonsPaginated,
  getDistinctNaturalHairColors,
  getDistinctBodyTypes,
  getDistinctEthnicities,
} from "@/lib/services/person-service";
import { getFavoritePhotosForPersons } from "@/lib/services/photo-service";
import type { PersonStatus } from "@/lib/types";
import { PersonList } from "@/components/people/person-list";
import { PersonSearch } from "@/components/people/person-search";
import { StatusFilter } from "@/components/people/status-filter";
import { AddPersonSheet } from "@/components/people/add-person-sheet";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_LOADED = 500;

type PeoplePageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    hairColor?: string;
    bodyType?: string;
    ethnicity?: string;
    loaded?: string;
  }>;
};

const VALID_STATUSES = new Set<string>(["active", "inactive", "wishlist", "archived"]);

function isPersonStatus(value: string): value is PersonStatus {
  return VALID_STATUSES.has(value);
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { q, status, hairColor, bodyType, ethnicity, loaded } = await searchParams;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const resolvedStatus =
    status && isPersonStatus(status) ? status : undefined;

  const filters = {
    q: q?.trim() || undefined,
    status: resolvedStatus ?? ("all" as const),
    naturalHairColor: hairColor || undefined,
    bodyType: bodyType || undefined,
    ethnicity: ethnicity || undefined,
  };

  const [paginated, hairColors, bodyTypes, ethnicities] = await Promise.all([
    getPersonsPaginated(filters, undefined, limit),
    getDistinctNaturalHairColors(),
    getDistinctBodyTypes(),
    getDistinctEthnicities(),
  ]);

  // Suppress unused variable warnings — filter dropdowns available for future use
  void hairColors;
  void bodyTypes;
  void ethnicities;

  // Batch-load profile photos for initial chunk
  const photoMapRaw = await getFavoritePhotosForPersons(paginated.items.map((p) => p.id));
  const photoMap = Object.fromEntries(photoMapRaw);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Users size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">People</h1>
            <p className="text-sm text-muted-foreground">
              {paginated.totalCount} {paginated.totalCount === 1 ? "person" : "people"}
            </p>
          </div>
        </div>
        <AddPersonSheet />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <PersonSearch />
          </Suspense>
        </div>
        <Suspense>
          <StatusFilter />
        </Suspense>
      </div>

      {/* People grid */}
      <PersonList
        persons={paginated.items}
        photoMap={photoMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
      />
    </div>
  );
}
