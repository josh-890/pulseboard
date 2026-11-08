import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityMark } from "@/components/shared/entity-mark";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";
import type { MakerTileData } from "@/lib/services/maker-list-service";

/** The compact list view of a list page: one line per maker, for looking things up */
export function MakerRows({ tiles, round = false }: { tiles: MakerTileData[]; round?: boolean }) {
  return (
    <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm">
      {tiles.map((t) => {
        const tier = t.tier ? CHANNEL_TIER_CONFIG.find((x) => x.value === t.tier) : null;
        const span = t.firstYear === null ? "" : t.firstYear === t.lastYear ? String(t.firstYear) : `${t.firstYear}–${t.lastYear}`;
        return (
          <li key={t.id}>
            <Link
              href={t.href}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_1fr_10rem_3rem_6rem_6rem]",
                t.closed && "opacity-70",
              )}
            >
              <EntityMark brand={t.brand} variant="tile" size="sm" round={round} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.brand.name}</span>
                {t.context && <span className="block truncate text-[11px] text-muted-foreground sm:hidden">{t.context.label}</span>}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{t.context?.label ?? ""}</span>
              <span className="hidden sm:block">
                {tier && <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", tier.border, tier.bg, tier.text)}>{tier.letter}</span>}
              </span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {t.rating !== null && (
                  <span className="mr-2 inline-flex items-center gap-0.5 text-amber-500">
                    <Star size={11} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                    {t.rating}
                  </span>
                )}
                <span className="font-semibold text-foreground">{t.sets}</span> sets
              </span>
              <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">{span}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
