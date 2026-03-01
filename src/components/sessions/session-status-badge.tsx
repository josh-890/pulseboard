import type { SessionStatus, SessionType } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionStatusBadgeProps = {
  status: SessionStatus;
  className?: string;
};

const STATUS_STYLES: Record<SessionStatus, string> = {
  DRAFT: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CONFIRMED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
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

type SessionTypeBadgeProps = {
  type: SessionType;
  className?: string;
};

const TYPE_STYLES: Record<SessionType, string> = {
  REFERENCE: "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400",
  PRODUCTION: "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const TYPE_LABELS: Record<SessionType, string> = {
  REFERENCE: "Reference",
  PRODUCTION: "Production",
};

export function SessionTypeBadge({ type, className }: SessionTypeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TYPE_STYLES[type],
        className,
      )}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
