import { ExternalLink } from "lucide-react";
import { EntityMark } from "@/components/shared/entity-mark";
import { StarRating } from "@/components/shared/star-rating";
import { HeroKpi } from "@/components/shared/hero-kpi";
import { setArtistRatingAction } from "@/lib/actions/artist-actions";
import type { EntityBrand } from "@/lib/brand-mark";
import type { ArtistHeroStats } from "@/lib/services/artist-service";

type ArtistHeroProps = {
  artist: { id: string; nationality: string | null; website: string | null; rating: number | null; aliases: { alias: string }[] };
  brand: EntityBrand;
  stats: ArtistHeroStats;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The artist's hero: portrait (or monogram), name, what they are credited as, your ★, the numbers */
export function ArtistHero({ artist, brand, stats }: ArtistHeroProps) {
  const sets = stats.photoSets + stats.videoSets;
  const years =
    stats.firstYear === null ? "—" : stats.firstYear === stats.lastYear ? String(stats.firstYear) : `${stats.firstYear}–${stats.lastYear}`;

  return (
    <section className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <EntityMark brand={brand} variant="tile" size="xl" round />
          <div className="min-w-0">
            <h1 className="min-w-0">
              <EntityMark brand={{ ...brand, logoUrl: null }} variant="wordmark" size="lg" />
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {stats.roles.map((r) => (
                <span key={r} className="rounded-full border border-white/15 bg-muted/40 px-2.5 py-0.5 font-medium">
                  {r}
                </span>
              ))}
              {artist.nationality && <span className="text-muted-foreground">{artist.nationality}</span>}
              {artist.website && (
                <a
                  href={artist.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  {hostOf(artist.website)}
                </a>
              )}
            </div>
            {artist.aliases.length > 0 && (
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                also credited as {artist.aliases.map((a) => a.alias).join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 lg:shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your rating</p>
            <StarRating initialRating={artist.rating} onRate={setArtistRatingAction.bind(null, artist.id)} noun="artist" className="-ml-0.5" />
          </div>
          <HeroKpi label="Sets" value={sets.toLocaleString()} sub={sets > 0 ? `${stats.photoSets} photo · ${stats.videoSets} video` : undefined} />
          <HeroKpi label="Channels" value={stats.channels.toLocaleString()} />
          <HeroKpi label="Models" value={stats.models.toLocaleString()} />
          <HeroKpi label="Active" value={years} />
        </div>
      </div>
    </section>
  );
}
