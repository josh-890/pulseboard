import Link from "next/link";
import { Wrench, CheckCircle2 } from "lucide-react";
import { getBaselineGapTotals } from "@/lib/services/maintenance-service";

export async function MaintenanceTile() {
  const totals = await getBaselineGapTotals();
  const allClean = totals.personsWithGaps === 0;

  return (
    <Link
      href="/maintenance"
      className="block rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md transition-colors hover:border-amber-400/50 md:p-6 dark:border-white/10"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            allClean ? "bg-emerald-500/15" : "bg-amber-500/15"
          }`}
        >
          {allClean ? (
            <CheckCircle2 size={20} className="text-emerald-400" />
          ) : (
            <Wrench size={20} className="text-amber-400" />
          )}
        </div>
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Data quality
          </div>
          <div className="text-lg font-semibold">
            {allClean
              ? "All baselines complete"
              : `${totals.personsWithGaps} of ${totals.totalPersons} need attention`}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {allClean
          ? "Every person has a baseline value for every active attribute."
          : "Open the maintenance page to fix gaps in baseline data."}
      </p>
    </Link>
  );
}
