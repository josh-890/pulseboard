import { Users } from "lucide-react";
import Link from "next/link";
import {
  PeopleSearchSidebar,
  type AttributeGroupForFilter,
} from "@/components/people/people-search-sidebar";
import { PersonList } from "@/components/people/person-list";
import { AddPersonSheet } from "@/components/people/add-person-sheet";
import { getHeadshotsForPersons } from "@/lib/services/media-service";
import {
  searchPeople,
  getFacetCounts,
  getAttributeFacetsForDefinitions,
} from "@/lib/services/person-search-service";
import { getAllPhysicalAttributeGroups } from "@/lib/services/physical-attribute-catalog-service";
import { listSavedSearches } from "@/lib/services/saved-search-service";
import { specFromUrlParams } from "@/lib/types/filter-spec";
import { withTenantFromHeaders } from "@/lib/tenant-context";

type PeopleSearchPageProps = {
  searchParams: Record<string, string>;
};

export async function PeopleSearchPage({ searchParams }: PeopleSearchPageProps) {
  // Tenant context is per-request and lives in AsyncLocalStorage. When a parent
  // server component returns this element from inside withTenantFromHeaders, the
  // ALS context does NOT propagate into our subsequent data fetches — React
  // renders this function in a fresh microtask. We must re-establish the tenant
  // context here, or every query falls back to the first registered tenant.
  return withTenantFromHeaders(() => renderPage(searchParams));
}

async function renderPage(searchParams: Record<string, string>) {
  // Build URLSearchParams from the resolved search params dict
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v != null) params.set(k, v);
  }
  const spec = specFromUrlParams(params);

  const limit = 100;
  const [result, facets, attrGroupsRaw, savedSearches] = await Promise.all([
    searchPeople(spec, { limit }),
    getFacetCounts(spec),
    getAllPhysicalAttributeGroups(),
    listSavedSearches("people"),
  ]);

  const allDefinitionIds = attrGroupsRaw.flatMap((g) => g.definitions.map((d) => d.id));
  const attributeFacets = await getAttributeFacetsForDefinitions(spec, allDefinitionIds);

  const attributeGroups: AttributeGroupForFilter[] = attrGroupsRaw
    .map((g) => ({
      groupName: g.name,
      options: g.definitions.map((d) => ({
        definitionId: d.id,
        slug: d.slug,
        name: d.name,
        groupName: g.name,
      })),
    }))
    .filter((g) => g.options.length > 0);

  const personIds = result.items.map((p) => p.id);
  const headshotMap = await getHeadshotsForPersons(personIds);
  const photoMap: Record<string, { url: string; focalX: number | null; focalY: number | null }> = {};
  for (const id of personIds) {
    const h = headshotMap.get(id);
    if (h) photoMap[id] = h;
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-person/15">
            <Users size={20} className="text-entity-person" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">People</h1>
            <p className="text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "person" : "people"} match
              <Link href="/people" className="ml-2 text-xs text-primary/70 hover:underline">
                ← back to classic view
              </Link>
            </p>
          </div>
        </div>
        <AddPersonSheet />
      </div>

      {/* Sidebar + results */}
      <div className="flex gap-4">
        <PeopleSearchSidebar
          facets={{
            categorical: facets.categorical,
            presence: facets.presence,
            attribute: attributeFacets,
          }}
          attributeGroups={attributeGroups}
          savedSearches={savedSearches}
        />
        <div className="min-w-0 flex-1">
          <PersonList
            persons={result.items}
            photoMap={photoMap}
            nextCursor={null}
            totalCount={result.total}
            filters={{ q: undefined, status: "all" }}
          />
        </div>
      </div>
    </div>
  );
}
