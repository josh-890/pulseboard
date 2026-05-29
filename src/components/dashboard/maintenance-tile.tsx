import Link from "next/link";
import { Wrench, CheckCircle2, AlertTriangle } from "lucide-react";
import { getBaselineGapTotals } from "@/lib/services/maintenance-service";

export async function MaintenanceTile() {
  const totals = await getBaselineGapTotals();
  const tier1 = totals.tier1PersonsWithGaps;
  const tier2 = totals.tier2PersonsWithGaps;
  const allClean = tier1 === 0 && tier2 === 0;
  const onlyHints = tier1 === 0 && tier2 > 0;

  const Icon = allClean ? CheckCircle2 : tier1 > 0 ? AlertTriangle : Wrench;
  const iconBg = allClean
    ? "bg-emerald-500/15"
    : tier1 > 0
      ? "bg-amber-500/15"
      : "bg-sky-500/15";
  const iconColor = allClean
    ? "text-emerald-400"
    : tier1 > 0
      ? "text-amber-400"
      : "text-sky-400";

  return (
    <Link
      href="/maintenance"
      className="block rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md transition-colors hover:border-amber-400/50 md:p-6 dark:border-white/10"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Data quality
          </div>
          <div className="text-lg font-semibold">
            {allClean
              ? "All baselines complete"
              : onlyHints
                ? `${tier2} of ${totals.totalPersons} have hints`
                : `${tier1} of ${totals.totalPersons} need attention`}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {allClean
          ? "Every person has a baseline value for every Tier 1 and Tier 2 attribute."
          : tier1 > 0 && tier2 > 0
            ? `+${tier2} also have Tier 2 hints. Open the maintenance page to fix.`
            : tier1 > 0
              ? "Open the maintenance page to fix Tier 1 gaps."
              : "Open the maintenance page to review Tier 2 hints."}
      </p>
    </Link>
  );
}
