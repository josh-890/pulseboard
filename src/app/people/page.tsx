import { Suspense } from "react";
import { Users } from "lucide-react";
import {
  getPersonsPaginated,
  getDistinctNaturalHairColors,
  getDistinctBodyTypes,
  getDistinctEthnicities,
} from "@/lib/services/person-service";
import { getFavoritePhotosForPersons } from "@/lib/services/photo-service";
import { getHeadshotsForPersons } from "@/lib/services/media-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import type { PersonStatus } from "@/lib/types";
import { PersonList } from "@/components/people/person-list";
import { PersonSearch } from "@/components/people/person-search";
import { StatusFilter } from "@/components/people/status-filter";
import { HeadshotSlotSelector } from "@/components/people/headshot-slot-selector";
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
    slot?: string;
  }>;
};

const VALID_STATUSES = new Set<string>(["active", "inactive", "wishlist", "archived"]);

function isPersonStatus(value: string): value is PersonStatus {
  return VALID_STATUSES.has(value);
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { q, status, hairColor, bodyType, ethnicity, loaded, slot: slotParam } = await searchParams;

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

  const parsedSlot = slotParam ? parseInt(slotParam, 10) : undefined;
  const slot = parsedSlot && parsedSlot >= 1 && parsedSlot <= 5 ? parsedSlot : undefined;

  const [paginated, hairColors, bodyTypes, ethnicities, slotLabels] = await Promise.all([
    getPersonsPaginated(filters, undefined, limit),
    getDistinctNaturalHairColors(),
    getDistinctBodyTypes(),
    getDistinctEthnicities(),
    getProfileImageLabels(),
  ]);

  // Suppress unused variable warnings — filter dropdowns available for future use
  void hairColors;
  void bodyTypes;
  void ethnicities;

  // Batch-load profile photos for initial chunk
  const personIds = paginated.items.map((p) => p.id);
  const headshotMap = await getHeadshotsForPersons(personIds, slot);

  // Fallback to legacy photos for persons without headshots
  const missingIds = personIds.filter((id) => !headshotMap.has(id));
  const legacyMapRaw = missingIds.length > 0
    ? await getFavoritePhotosForPersons(missingIds)
    : new Map<string, string>();

  const photoMap: Record<string, string> = {};
  for (const id of personIds) {
    const url = headshotMap.get(id) ?? legacyMapRaw.get(id);
    if (url) photoMap[id] = url;
  }

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
        <Suspense>
          <HeadshotSlotSelector slotLabels={slotLabels} />
        </Suspense>
      </div>

      {/* People grid */}
      <PersonList
        persons={paginated.items}
        photoMap={photoMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
        slot={slot}
      />
    </div>
  );
}
