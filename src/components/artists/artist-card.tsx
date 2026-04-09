import Link from "next/link";
import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";
import type { getArtists } from "@/lib/services/artist-service";

type ArtistItem = Awaited<ReturnType<typeof getArtists>>[number];

type ArtistCardProps = {
  artist: ArtistItem;
};

export function ArtistCard({ artist }: ArtistCardProps) {
  const creditCount = artist._count.creditsRaw;

  return (
    <Link href={`/artists/${artist.id}`} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
          "transition-all duration-150",
          "hover:shadow-md hover:-translate-y-px",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        <div className="space-y-2 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-500">
              <Palette size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-semibold leading-snug">
                {artist.name}
              </h3>
              {artist.nationality && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {artist.nationality}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{creditCount} {creditCount === 1 ? "set" : "sets"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
