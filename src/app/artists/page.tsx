import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Palette } from "lucide-react";
import { getArtists } from "@/lib/services/artist-service";
import { ArtistCard } from "@/components/artists/artist-card";
import { ArtistSearch } from "@/components/artists/artist-search";
import { AddArtistButton } from "@/components/artists/add-artist-button";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type ArtistsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ArtistsPage({ searchParams }: ArtistsPageProps) {
  return withTenantFromHeaders(async () => {
    const { q } = await searchParams;
    const artists = await getArtists(q?.trim() || undefined);

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

        {/* Search */}
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <ArtistSearch />
          </Suspense>
        </div>

        {/* Grid */}
        {artists.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {q ? "No artists match your search." : "No artists yet."}
          </div>
        )}
      </div>
    );
  });
}
