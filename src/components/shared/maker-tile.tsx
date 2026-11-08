import Link from "next/link";
import NextImage from "next/image";
import { Camera, Star } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import { EntityMark } from "@/components/shared/entity-mark";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";
import type { MakerTileData } from "@/lib/services/maker-list-service";

function years(t: MakerTileData): string | null {
  if (t.firstYear === null) return null;
  return t.firstYear === t.lastYear ? String(t.firstYear) : `${t.firstYear}–${t.lastYear}`;
}

/** One channel, label or artist on its list page: mark, its three newest covers, the numbers */
export function MakerTile({ tile, round = false }: { tile: MakerTileData; round?: boolean }) {
  const tier = tile.tier ? CHANNEL_TIER_CONFIG.find((t) => t.value === tile.tier) : null;
  const span = years(tile);
  return (
    <Link
      href={tile.href}
      className={cn(
        "group flex h-full flex-col gap-3 rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm transition-all duration-150",
        "hover:-translate-y-px hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tile.closed && "opacity-75",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {round && <EntityMark brand={tile.brand} variant="tile" size="md" round />}
        <div className="min-w-0 flex-1">
          <EntityMark brand={round ? { ...tile.brand, logoUrl: null } : tile.brand} variant="wordmark" size="md" />
          {tile.context && (
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              {tile.context.brand && <EntityMark brand={tile.context.brand} variant="tile" size="xs" />}
              <span className="truncate">{tile.context.label}</span>
            </span>
          )}
        </div>
        {tile.rating !== null && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-500" aria-label={`rated ${tile.rating} of 5`}>
            <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />
            {tile.rating}
          </span>
        )}
      </div>

      {/* The three newest covers — the work at a glance */}
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 3 }, (_, i) => {
          const c = tile.covers[i];
          return (
            <div key={i} className="relative aspect-[2/3] overflow-hidden rounded-md bg-black/[0.06] ring-1 ring-black/10 dark:bg-white/[0.06] dark:ring-white/10">
              {c ? (
                <NextImage
                  src={c.url}
                  alt=""
                  fill
                  unoptimized
                  loading="lazy"
                  sizes="120px"
                  style={focalStyle(c.focalX, c.focalY)}
                  className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
                />
              ) : (
                i === 0 && (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <Camera size={16} aria-hidden="true" />
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px]">
        {tier && (
          <span className={cn("rounded-full border px-2 py-0.5 font-semibold", tier.border, tier.bg, tier.text)}>{tier.letter}</span>
        )}
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{tile.sets.toLocaleString()}</span> {tile.sets === 1 ? "set" : "sets"}
          {tile.videoSets > 0 && ` · ${tile.videoSets} video`}
          {tile.channels !== null && tile.channels > 0 && ` · ${tile.channels} ${tile.channels === 1 ? "channel" : "channels"}`}
        </span>
        {span && <span className="tabular-nums text-muted-foreground">· {span}</span>}
        {tile.closed && <span className="text-muted-foreground">· closed</span>}
      </div>
    </Link>
  );
}
