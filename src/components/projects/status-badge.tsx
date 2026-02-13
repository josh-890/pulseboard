import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

type StatusBadgeProps = {
  status: ProjectStatus;
};

const statusStyles: Record<ProjectStatus, string> = {
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  paused:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  done: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

const statusLabels: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("rounded-full border-0", statusStyles[status])}
    >
      {statusLabels[status]}
    </Badge>
  );
}
