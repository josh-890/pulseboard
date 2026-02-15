import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { getRecentActivities } from "@/lib/services/activity-service";

export const dynamic = "force-dynamic";

export default async function Home() {
  const activities = await getRecentActivities(6);

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Dashboard</h1>
      <KpiGrid />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityFeed items={activities} />
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
