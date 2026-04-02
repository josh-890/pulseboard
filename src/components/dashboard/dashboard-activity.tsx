import { ActivityFeed } from "./activity-feed";
import { getRecentActivities } from "@/lib/services/activity-service";
import { withTenantFromHeaders } from "@/lib/tenant-context";

export async function DashboardActivity() {
  const activities = await withTenantFromHeaders(() => getRecentActivities(6));

  return <ActivityFeed items={activities} />;
}
