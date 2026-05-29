import Link from "next/link";
import { ChevronRight, AlertTriangle, Info } from "lucide-react";
import type { BaselineGapByAttribute } from "@/lib/services/maintenance-service";
import { cn } from "@/lib/utils";

type Props = {
  rows: BaselineGapByAttribute[];
};

export function BaselineGapsByAttributeTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-card/30 p-8 text-center text-sm text-muted-foreground">
        No tiered attributes configured yet. Set <code>tier</code> on any
        attribute definition in the catalog manager to surface it here.
      </div>
    );
  }

  const tier1 = rows.filter((r) => r.tier === "TIER_1");
  const tier2 = rows.filter((r) => r.tier === "TIER_2");

  return (
    <div className="space-y-6">
      {tier1.length > 0 && (
        <Section
          tier="TIER_1"
          title="Warnings — Tier 1 (every person should have this)"
          rows={tier1}
        />
      )}
      {tier2.length > 0 && (
        <Section
          tier="TIER_2"
          title="Hints — Tier 2 (universal, nice to know)"
          rows={tier2}
        />
      )}
    </div>
  );
}

function Section({
  tier,
  title,
  rows,
}: {
  tier: "TIER_1" | "TIER_2";
  title: string;
  rows: BaselineGapByAttribute[];
}) {
  const isWarn = tier === "TIER_1";
  const Icon = isWarn ? AlertTriangle : Info;
  const accent = isWarn ? "text-amber-400" : "text-sky-400";
  const border = isWarn ? "border-amber-500/20" : "border-sky-500/20";
  const bg = isWarn ? "bg-amber-500/[0.03]" : "bg-sky-500/[0.02]";

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} className={accent} />
        <h2 className={cn("text-xs font-medium uppercase tracking-wider", accent)}>
          {title}
        </h2>
      </div>
      <div className={cn("overflow-hidden rounded-xl border", border, bg)}>
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted-foreground/80">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Attribute</th>
              <th className="px-4 py-3 text-left font-medium">Group</th>
              <th className="px-4 py-3 text-right font-medium">Populated</th>
              <th
                className="px-4 py-3 text-right font-medium"
                title="Persons explicitly marked with no value (verified unknown)"
              >
                Unknown
              </th>
              <th className="px-4 py-3 text-right font-medium">Missing</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => {
              const isFull = r.missingCount === 0;
              // Person-column rows drill into the narrow `missing=` filter
              // primitive; catalog rows use the baseline-presence primitive.
              const drillHref = r.isPersonColumn
                ? `/people?mode=advanced&missing=${r.slug.replace("_person.", "")}`
                : `/people?mode=advanced&attr.${r.definitionId}.baseline=missing`;
              return (
                <tr
                  key={r.slug}
                  className={cn(
                    "transition-colors",
                    isFull ? "opacity-60" : "hover:bg-white/[0.02]",
                  )}
                >
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.groupName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.populatedCount}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      r.verifiedUnknownCount > 0
                        ? "text-muted-foreground"
                        : "text-muted-foreground/30",
                    )}
                  >
                    {r.verifiedUnknownCount}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums font-medium",
                      r.missingCount > 0 && (isWarn ? "text-amber-400" : "text-sky-400"),
                    )}
                  >
                    {r.missingCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.missingCount > 0 ? (
                      <Link
                        href={drillHref}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-white/[0.04]",
                          isWarn ? "text-amber-300" : "text-sky-300",
                        )}
                      >
                        Show missing
                        <ChevronRight size={14} />
                      </Link>
                    ) : (
                      <span className="text-xs text-emerald-400">Complete</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
