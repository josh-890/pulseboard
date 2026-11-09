import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityMark } from "@/components/shared/entity-mark";
import { StarRating } from "@/components/shared/star-rating";
import { HeroKpi } from "@/components/shared/hero-kpi";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";
import { setChannelRatingAction } from "@/lib/actions/channel-actions";
import type { EntityBrand } from "@/lib/brand-mark";
import type { ChannelHeroStats } from "@/lib/services/channel-service";
import type { ChannelTier } from "@/generated/prisma/client";

type ChannelHeroProps = {
  channel: {
    id: string;
    shortName: string | null;
    tier: ChannelTier;
    platform: string | null;
    url: string | null;
    rating: number | null;
    closed: boolean;
  };
  brand: EntityBrand;
  label: { id: string; name: string; brand: EntityBrand } | null;
  stats: ChannelHeroStats;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The channel's hero: its mark (logo or generated wordmark) — no photo; the
 * work starts in the Showcase below — with tier, label, your ★ and the numbers.
 */
export function ChannelHero({ channel, brand, label, stats }: ChannelHeroProps) {
  const tier = CHANNEL_TIER_CONFIG.find((t) => t.value === channel.tier);
  const sets = stats.photoSets + stats.videoSets;
  const years =
    stats.firstYear === null
      ? "—"
      : stats.firstYear === stats.lastYear
        ? String(stats.firstYear)
        : `${stats.firstYear}–${stats.lastYear}`;

  return (
    <section className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="min-w-0">
            <EntityMark brand={brand} variant="wordmark" size="xl" />
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {channel.shortName && (
              <span className="rounded-full border border-white/15 bg-muted/40 px-2.5 py-0.5 font-mono font-medium text-muted-foreground">
                {channel.shortName}
              </span>
            )}
            {tier && (
              <span
                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold", tier.border, tier.bg, tier.text)}
                title="Tier — production quality and importance"
              >
                {tier.letter} · {tier.label}
              </span>
            )}
            {label && (
              <Link
                href={`/labels/${label.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-muted/40 py-0.5 pl-1 pr-2.5 font-medium transition-colors hover:bg-muted hover:text-primary"
              >
                <EntityMark brand={label.brand} variant="tile" size="xs" />
                {label.name}
              </Link>
            )}
            {channel.closed && (
              <span className="rounded-full border border-slate-400/40 bg-slate-400/15 px-2.5 py-0.5 font-medium text-slate-600 dark:text-slate-300">
                Closed
              </span>
            )}
            {channel.platform && (
              <span className="rounded-full border border-white/15 bg-muted/40 px-2.5 py-0.5 text-muted-foreground">{channel.platform}</span>
            )}
            {channel.url && (
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink size={12} aria-hidden="true" />
                {hostOf(channel.url)}
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 lg:shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your rating</p>
            <StarRating
              initialRating={channel.rating}
              onRate={setChannelRatingAction.bind(null, channel.id)}
              noun="channel"
              className="-ml-0.5"
            />
          </div>
          <HeroKpi
            label="Sets"
            value={sets.toLocaleString()}
            sub={sets > 0 ? `${stats.photoSets} photo · ${stats.videoSets} video` : undefined}
          />
          <HeroKpi label="Models" value={stats.models.toLocaleString()} sub="in your library" />
          <HeroKpi label="Active" value={years} />
        </div>
      </div>
    </section>
  );
}
