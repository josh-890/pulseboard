import { Heart } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  getFavoriteMediaItems,
  getPersonsWithFavoriteMedia,
} from "@/lib/services/media-service";
import { FavoritesGallery } from "@/components/gallery/favorites-gallery";
import { FavoritesPersonFilter } from "@/components/gallery/favorites-person-filter";
import { GalleryTagFilter } from "@/components/tags";
import { findTagMatchIds, getTagFacets, resolveTagFilterParam } from "@/lib/services/tag-filter-service";

export const dynamic = "force-dynamic";

type FavoritesPageProps = {
  searchParams: Promise<{ person?: string; favPersons?: string; tags?: string }>;
};

export default async function FavoritesPage({ searchParams }: FavoritesPageProps) {
  return withTenantFromHeaders(async () => {
    const { person, favPersons, tags } = await searchParams;
    const favoritePersonsOnly = favPersons === "true";
    const [allItems, persons] = await Promise.all([
      getFavoriteMediaItems({ personId: person || undefined, favoritePersonsOnly }),
      getPersonsWithFavoriteMedia(),
    ]);
    // ADR-0033: tag filter over the favorites (facet counts within them)
    const allIds = allItems.map((i) => i.id);
    const [tagFilter, tagFacets] = await Promise.all([resolveTagFilterParam(tags, "MEDIA_ITEM"), getTagFacets("MEDIA_ITEM", allIds)]);
    const matchIds = tagFilter ? new Set(await findTagMatchIds("MEDIA_ITEM", tagFilter.resolved, allIds)) : null;
    const items = matchIds ? allItems.filter((i) => matchIds.has(i.id)) : allItems;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15">
              <Heart size={20} className="text-red-400" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Favorites</h1>
              <p className="text-sm text-muted-foreground">
                {items.length} favorite {items.length === 1 ? "image" : "images"}
                {person ? " for this person" : ""}.
              </p>
            </div>
          </div>
          <FavoritesPersonFilter persons={persons} favoritePersonsOnly={favoritePersonsOnly} />
        </div>

        {allItems.length > 0 && (
          <GalleryTagFilter
            facets={tagFacets}
            problems={tagFilter?.problems}
            shown={items.length}
            total={allItems.length}
          />
        )}

        {items.length === 0 && matchIds ? (
          <div className="rounded-2xl border border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
            No favorite matches these tags.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
            No favorites yet. Tap the heart on any image (or press <kbd>.</kbd> in the
            viewer) to add it here.
          </div>
        ) : (
          <FavoritesGallery items={items} />
        )}
      </div>
    );
  });
}
