import { Rocket, StickyNote, CheckSquare } from "lucide-react";
import type { ActivityItem as ActivityItemType } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

type ActivityItemProps = {
  item: ActivityItemType;
};

const typeIcons = {
  deploy: <Rocket size={16} className="text-primary" />,
  note: <StickyNote size={16} className="text-accent" />,
  task: <CheckSquare size={16} className="text-green-500" />,
};

export function ActivityItem({ item }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5">{typeIcons[item.type]}</div>
      <div className="flex-1">
        <p className="text-sm">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(item.time)}
        </p>
      </div>
    </div>
  );
}
