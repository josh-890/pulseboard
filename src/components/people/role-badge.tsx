import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectRole } from "@/lib/types";

type RoleBadgeProps = {
  role: ProjectRole;
};

const roleStyles: Record<ProjectRole, string> = {
  stakeholder:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  lead: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  member:
    "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

const roleLabels: Record<ProjectRole, string> = {
  stakeholder: "Stakeholder",
  lead: "Lead",
  member: "Member",
};

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("rounded-full border-0", roleStyles[role])}
    >
      {roleLabels[role]}
    </Badge>
  );
}
