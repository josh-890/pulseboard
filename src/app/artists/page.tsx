import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Palette } from "lucide-react";
import { getArtistTiles } from "@/lib/services/maker-list-service";
import { MakerTile } from "@/components/shared/maker-tile";
import { MakerRows } from "@/components/shared/maker-rows";
import { MakerListToolbar, parseMinRating, parseSort, type MakerListParams } from "@/components/shared/maker-list-toolbar";
import { ArtistSearch } from "@/components/artists/artist-search";
import { AddArtistButton } from "@/components/artists/add-artist-button";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type ArtistsPageProps = {
  searchParams: Promise<MakerListParams>;
};

export default async function ArtistsPage({ searchParams }: ArtistsPageProps) {
  return withTenantFromHeaders(async () => {
    const params = await searchParams;
    const q = params.q?.trim() || undefined;
    const artists = await getArtistTiles({ q, minRating: parseMinRating(params.rating), sort: parseSort(params.sort) });

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
              <Palette size={20} className="text-violet-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Artists</h1>
              <p className="text-sm text-muted-foreground">
                {artists.length} {artists.length === 1 ? "artist" : "artists"}
              </p>
            </div>
          </div>
          <AddArtistButton />
        </div>

        {/* Search + sort and filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:max-w-xs">
            <Suspense>
              <ArtistSearch />
            </Suspense>
          </div>
          <MakerListToolbar basePath="/artists" params={params} />
        </div>

        {artists.length > 0 ? (
          params.view === "list" ? (
            <MakerRows tiles={artists} round />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {artists.map((a) => (
                <li key={a.id}>
                  <MakerTile tile={a} round />
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {q ? "No artists match your search." : "No artists yet."}
          </div>
        )}
      </div>
    );
  });
}
