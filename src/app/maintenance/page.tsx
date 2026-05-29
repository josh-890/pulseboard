import { Wrench } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  getBaselineGapsByAttribute,
  getBaselineGapsByPerson,
  getBaselineGapTotals,
} from "@/lib/services/maintenance-service";
import { BaselineGapsByAttributeTable } from "@/components/maintenance/baseline-gaps-by-attribute-table";
import { BaselineGapsByPersonTable } from "@/components/maintenance/baseline-gaps-by-person-table";
import { MaintenanceTabs } from "@/components/maintenance/maintenance-tabs";

export const dynamic = "force-dynamic";

type MaintenancePageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function MaintenancePage({ searchParams }: MaintenancePageProps) {
  return withTenantFromHeaders(async () => {
    const { view: viewParam } = await searchParams;
    const view = viewParam === "by-person" ? "by-person" : "by-attribute";

    const [totals, byAttribute, byPerson] = await Promise.all([
      getBaselineGapTotals(),
      view === "by-attribute" ? getBaselineGapsByAttribute() : Promise.resolve([]),
      view === "by-person" ? getBaselineGapsByPerson() : Promise.resolve([]),
    ]);

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <Wrench size={20} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Maintenance</h1>
            <p className="text-sm text-muted-foreground">
              Audit baseline data completeness across people.
            </p>
          </div>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Persons with baseline gaps"
            value={totals.personsWithGaps}
            suffix={`of ${totals.totalPersons}`}
            tone={totals.personsWithGaps > 0 ? "warn" : "ok"}
          />
          <MetricCard
            label="Total persons"
            value={totals.totalPersons}
          />
          <MetricCard
            label="Active baseline attributes"
            value={totals.activeAttrsTotal}
            hint="Catalog attributes populated for ≥1 person."
          />
        </div>

        {/* Tab toggle */}
        <MaintenanceTabs current={view} />

        {/* Tab content */}
        {view === "by-attribute" ? (
          <BaselineGapsByAttributeTable rows={byAttribute} />
        ) : (
          <BaselineGapsByPersonTable rows={byPerson} />
        )}
      </div>
    );
  });
}

function MetricCard({
  label,
  value,
  suffix,
  hint,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  const accent =
    tone === "warn" && value > 0
      ? "text-amber-400"
      : tone === "ok" && value === 0
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4 backdrop-blur-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${accent}`}>{value}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}
