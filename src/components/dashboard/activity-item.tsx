import { UserPlus, ImagePlus, FolderPlus, Building2, StickyNote } from "lucide-react";
import type { ActivityItem as ActivityItemType } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

type ActivityItemProps = {
  item: ActivityItemType;
};

const typeIcons: Record<ActivityItemType["type"], React.ReactElement> = {
  person_added: <UserPlus size={16} className="text-primary" />,
  set_added: <ImagePlus size={16} className="text-accent" />,
  project_added: <FolderPlus size={16} className="text-green-500" />,
  label_added: <Building2 size={16} className="text-yellow-500" />,
  note: <StickyNote size={16} className="text-muted-foreground" />,
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
