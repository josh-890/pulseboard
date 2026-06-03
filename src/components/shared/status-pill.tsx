import { cn } from "@/lib/utils";

// Promoted / Staged status indicator used across the Career timeline
// (and reusable on /sets, /staging-sets, /channels/[id], /labels/[id]).
// The pill is one visual cue; the parent row also paints a left border
// stripe in the matching colour and (optionally) tints the whole row
// background. This component only renders the pill itself — the stripe
// and tint live on the consuming row to keep this primitive composable.

export type SetStatus = "promoted" | "staged";

const STATUS_LABELS: Record<SetStatus, string> = {
  promoted: "PROMOTED",
  staged: "STAGED",
};

const STATUS_PILL_CLASS: Record<SetStatus, string> = {
  promoted:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  staged:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function StatusPill({
  status,
  className,
}: {
  status: SetStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        STATUS_PILL_CLASS[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// Tailwind class strings for the matching border stripe + optional row
// background tint. Consuming row composes these onto its container so
// the stripe lines up with the row's left edge.
export const STATUS_STRIPE_CLASS: Record<SetStatus, string> = {
  promoted: "border-l-emerald-500",
  staged: "border-l-amber-500",
};

export const STATUS_TINT_CLASS: Record<SetStatus, string> = {
  promoted: "bg-emerald-500/[0.06]",
  staged: "bg-amber-500/[0.06]",
};
