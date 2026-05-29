import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BaselineGapByPerson } from "@/lib/services/maintenance-service";
import { cn } from "@/lib/utils";

type Props = {
  rows: BaselineGapByPerson[];
};

export function BaselineGapsByPersonTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center text-sm text-emerald-300">
        Every person has a baseline value for every tiered attribute. Nothing
        to fix here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-card/30">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted-foreground/80">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Person</th>
            <th className="px-4 py-3 text-right font-medium">T1</th>
            <th className="px-4 py-3 text-right font-medium">T2</th>
            <th className="px-4 py-3 text-left font-medium">Gaps</th>
            <th className="px-4 py-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => {
            const accentBorder =
              r.worstTier === "TIER_1"
                ? "border-l-2 border-l-amber-500/40"
                : "border-l-2 border-l-sky-500/40";
            return (
              <tr
                key={r.personId}
                className={cn("transition-colors hover:bg-white/[0.02]", accentBorder)}
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{r.displayName}</div>
                  <div className="text-[11px] text-muted-foreground">{r.icgId}</div>
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    r.tier1MissingCount > 0 ? "text-amber-400" : "text-muted-foreground/40",
                  )}
                >
                  {r.tier1MissingCount}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    r.tier2MissingCount > 0 ? "text-sky-400" : "text-muted-foreground/40",
                  )}
                >
                  {r.tier2MissingCount}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.missing.map((m) => {
                      // Verified-unknown chips render in muted gray with a
                      // tiny "?" prefix to differentiate from real gaps.
                      const chipClass = m.isVerifiedUnknown
                        ? "border-white/10 bg-muted/30 text-muted-foreground/60 italic"
                        : m.tier === "TIER_1"
                          ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-300"
                          : "border-sky-500/30 bg-sky-500/[0.06] text-sky-300";
                      return (
                        <span
                          key={`${m.slug}-${m.isVerifiedUnknown ? "u" : "m"}`}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            chipClass,
                          )}
                          title={
                            m.isVerifiedUnknown
                              ? "Marked unknown (verified)"
                              : "Missing baseline value"
                          }
                        >
                          {m.isVerifiedUnknown ? "? " : ""}
                          {m.slug.replace("_person.", "")}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/people/${r.personId}?tab=appearance`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-white/[0.04]"
                  >
                    Open profile
                    <ChevronRight size={14} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
