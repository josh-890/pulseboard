import { Suspense } from "react";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { KpiGridSkeleton } from "@/components/dashboard/kpi-grid-skeleton";
import { DashboardActivity } from "@/components/dashboard/dashboard-activity";
import { ActivityFeedSkeleton } from "@/components/dashboard/activity-feed-skeleton";
import { QuickActions } from "@/components/dashboard/quick-actions";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Dashboard</h1>
      <Suspense fallback={<KpiGridSkeleton />}>
        <KpiGrid />
      </Suspense>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<ActivityFeedSkeleton />}>
            <DashboardActivity />
          </Suspense>
        </div>
        <div>
          <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
            <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
            <QuickActions />
          </div>
        </div>
      </div>
    </div>
  );
}
