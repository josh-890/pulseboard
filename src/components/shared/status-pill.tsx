import { cn } from "@/lib/utils";

// Pipeline-state indicator used across the Career timeline (and reusable on
// /sets, /staging-sets, /channels/[id], /labels/[id]). Four confidence-graded
// states, ordered promoted → approved → reviewing → pending. The colour
// language mirrors the staging workspace (staging-set-row.tsx STATUS_BADGE)
// so the two surfaces stay consistent: pending=blue, reviewing=amber,
// approved=cyan, promoted=emerald. The archive-link pill stays red on the row
// (a distinct axis) — no collision.
//
// The pill is one visual cue; the parent row also paints a left border stripe
// in the matching colour and (optionally) tints the whole row background. This
// component only renders the pill itself — the stripe and tint live on the
// consuming row to keep this primitive composable.

export type SetStatus = "promoted" | "approved" | "reviewing" | "pending";

const STATUS_LABELS: Record<SetStatus, string> = {
  promoted: "PROMOTED",
  approved: "APPROVED",
  reviewing: "IN REVIEW",
  pending: "PENDING",
};

const STATUS_PILL_CLASS: Record<SetStatus, string> = {
  promoted:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  approved:
    "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  reviewing:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pending:
    "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
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
  approved: "border-l-cyan-500",
  reviewing: "border-l-amber-500",
  pending: "border-l-blue-500",
};

export const STATUS_TINT_CLASS: Record<SetStatus, string> = {
  promoted: "bg-emerald-500/[0.06]",
  approved: "bg-cyan-500/[0.06]",
  reviewing: "bg-amber-500/[0.06]",
  pending: "bg-blue-500/[0.06]",
};

// Human label for a status, e.g. for group headers / filter options.
export const STATUS_DISPLAY_LABEL: Record<SetStatus, string> = {
  promoted: "Promoted",
  approved: "Approved",
  reviewing: "In review",
  pending: "Pending",
};
