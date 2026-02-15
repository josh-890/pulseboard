import { ActivityFeed } from "./activity-feed";
import { getRecentActivities } from "@/lib/services/activity-service";

export async function DashboardActivity() {
  const activities = await getRecentActivities(6);

  return <ActivityFeed items={activities} />;
}
