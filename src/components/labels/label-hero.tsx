import { ExternalLink } from "lucide-react";
import { EntityMark } from "@/components/shared/entity-mark";
import { StarRating } from "@/components/shared/star-rating";
import { HeroKpi } from "@/components/shared/hero-kpi";
import { setLabelRatingAction } from "@/lib/actions/label-actions";
import type { EntityBrand } from "@/lib/brand-mark";
import type { LabelHeroStats } from "@/lib/services/label-service";

type LabelHeroProps = {
  label: { id: string; website: string | null; rating: number | null };
  brand: EntityBrand;
  stats: LabelHeroStats;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The label's hero: its mark, website, your ★, and the numbers over the channels it owns */
export function LabelHero({ label, brand, stats }: LabelHeroProps) {
  const sets = stats.photoSets + stats.videoSets;
  const years =
    stats.firstYear === null ? "—" : stats.firstYear === stats.lastYear ? String(stats.firstYear) : `${stats.firstYear}–${stats.lastYear}`;

  return (
    <section className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Label</p>
          <h1 className="min-w-0">
            <EntityMark brand={brand} variant="wordmark" size="xl" />
          </h1>
          {label.website && (
            <a
              href={label.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink size={12} aria-hidden="true" />
              {hostOf(label.website)}
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 lg:shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your rating</p>
            <StarRating initialRating={label.rating} onRate={setLabelRatingAction.bind(null, label.id)} noun="label" className="-ml-0.5" />
          </div>
          <HeroKpi label="Channels" value={stats.channels.toLocaleString()} />
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
