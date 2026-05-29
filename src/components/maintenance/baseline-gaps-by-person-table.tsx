import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BaselineGapByPerson } from "@/lib/services/maintenance-service";

type Props = {
  rows: BaselineGapByPerson[];
};

export function BaselineGapsByPersonTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center text-sm text-emerald-300">
        Every person has a baseline value for every active attribute. Nothing
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
            <th className="px-4 py-3 text-right font-medium">Missing</th>
            <th className="px-4 py-3 text-left font-medium">Gaps</th>
            <th className="px-4 py-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr key={r.personId} className="transition-colors hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <div className="font-medium">{r.displayName}</div>
                <div className="text-[11px] text-muted-foreground">{r.icgId}</div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-400">
                {r.missingCount}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {r.missingSlugs.map((slug) => (
                    <span
                      key={slug}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {slug}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/people/${r.personId}?tab=appearance`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/10"
                >
                  Open profile
                  <ChevronRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
