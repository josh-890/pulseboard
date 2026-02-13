import type { ActivityItem as ActivityItemType } from "@/lib/types";
import { ActivityItem } from "./activity-item";

type ActivityFeedProps = {
  items: ActivityItemType[];
  limit?: number;
};

export function ActivityFeed({ items, limit }: ActivityFeedProps) {
  const displayItems = limit ? items.slice(0, limit) : items;

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
      <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
      <div className="divide-y divide-border">
        {displayItems.map((item) => (
          <ActivityItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
