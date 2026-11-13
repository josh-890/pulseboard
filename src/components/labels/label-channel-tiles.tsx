import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityMark } from "@/components/shared/entity-mark";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";
import type { LabelChannelTile } from "@/lib/services/label-service";

/** The channels a label owns, as wordmark tiles — most sets first */
export function LabelChannelTiles({ channels }: { channels: LabelChannelTile[] }) {
  if (channels.length === 0) {
    return <p className="text-sm italic text-muted-foreground/70">This label owns no channels yet.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {channels.map((c) => {
        const tier = CHANNEL_TIER_CONFIG.find((t) => t.value === c.tier);
        const years =
          c.firstYear === null ? null : c.firstYear === c.lastYear ? String(c.firstYear) : `${c.firstYear}–${c.lastYear}`;
        return (
          <li key={c.id}>
            <Link
              href={`/channels/${c.id}`}
              data-trail-name={c.brand.name}
              className={cn(
                "group flex h-full flex-col gap-3 rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm transition-all duration-150",
                "hover:-translate-y-px hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                c.closed && "opacity-75",
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <EntityMark brand={c.brand} variant="wordmark" size="lg" className="min-w-0" />
                {c.rating !== null && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-500" aria-label={`rated ${c.rating} of 5`}>
                    <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                    {c.rating}
                  </span>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px]">
                {tier && (
                  <span className={cn("rounded-full border px-2 py-0.5 font-semibold", tier.border, tier.bg, tier.text)}>
                    {tier.letter} · {tier.label}
                  </span>
                )}
                <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 tabular-nums text-muted-foreground">
                  {c.sets} {c.sets === 1 ? "set" : "sets"}
                  {c.videoSets > 0 && ` · ${c.videoSets} video`}
                </span>
                {c.staged > 0 && (
                  <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 tabular-nums text-muted-foreground">
                    {c.staged} staged
                  </span>
                )}
                {years && <span className="tabular-nums text-muted-foreground">{years}</span>}
                {c.closed && <span className="text-muted-foreground">· closed</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
