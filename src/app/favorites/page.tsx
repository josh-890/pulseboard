import { Heart } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  getFavoriteMediaItems,
  getPersonsWithFavoriteMedia,
} from "@/lib/services/media-service";
import { FavoritesGallery } from "@/components/gallery/favorites-gallery";
import { FavoritesPersonFilter } from "@/components/gallery/favorites-person-filter";

export const dynamic = "force-dynamic";

type FavoritesPageProps = {
  searchParams: Promise<{ person?: string; favPersons?: string }>;
};

export default async function FavoritesPage({ searchParams }: FavoritesPageProps) {
  return withTenantFromHeaders(async () => {
    const { person, favPersons } = await searchParams;
    const favoritePersonsOnly = favPersons === "true";
    const [items, persons] = await Promise.all([
      getFavoriteMediaItems({ personId: person || undefined, favoritePersonsOnly }),
      getPersonsWithFavoriteMedia(),
    ]);

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

        {items.length === 0 ? (
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
