import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BaselineGapByAttribute } from "@/lib/services/maintenance-service";
import { cn } from "@/lib/utils";

type Props = {
  rows: BaselineGapByAttribute[];
};

export function BaselineGapsByAttributeTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-card/30 p-8 text-center text-sm text-muted-foreground">
        No active baseline attributes yet. Once any person has a baseline value
        recorded, this list will populate.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-card/30">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted-foreground/80">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Attribute</th>
            <th className="px-4 py-3 text-left font-medium">Group</th>
            <th className="px-4 py-3 text-right font-medium">Populated</th>
            <th className="px-4 py-3 text-right font-medium">Missing</th>
            <th className="px-4 py-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => {
            const isFull = r.missingCount === 0;
            // ADR-0008: drill-down uses the baseline-presence URL primitive,
            // not the (removed) sidebar dropdown.
            const drillHref = `/people?mode=advanced&attr.${r.definitionId}.baseline=missing`;
            return (
              <tr
                key={r.definitionId}
                className={cn(
                  "transition-colors",
                  isFull ? "opacity-60" : "hover:bg-white/[0.02]",
                )}
              >
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.groupName}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.populatedCount}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    r.missingCount > 0 && "text-amber-400",
                  )}
                >
                  {r.missingCount}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.missingCount > 0 ? (
                    <Link
                      href={drillHref}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/10"
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
  );
}
