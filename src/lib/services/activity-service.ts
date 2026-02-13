import { activities } from "@/lib/data/activities";
import type { ActivityItem } from "@/lib/types";

export function getRecentActivities(limit?: number): ActivityItem[] {
  if (limit) {
    return activities.slice(0, limit);
  }
  return activities;
}
