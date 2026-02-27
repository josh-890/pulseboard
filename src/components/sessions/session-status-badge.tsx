import type { SessionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionStatusBadgeProps = {
  status: SessionStatus;
  className?: string;
};

const STATUS_STYLES: Record<SessionStatus, string> = {
  DRAFT: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CONFIRMED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  REFERENCE: "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  REFERENCE: "Reference",
};

export function SessionStatusBadge({ status, className }: SessionStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
