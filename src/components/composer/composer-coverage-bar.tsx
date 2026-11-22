import { cn } from "@/lib/utils";

export type ComposerCoverageBarProps = { tagged: number; total: number; className?: string };

/**
 * How far a set's photos are tagged in the Composer (ADR-0042, S5): a hairline
 * along the bottom of its cover, full when every photo carries a Composer tag.
 */
export function ComposerCoverageBar({ tagged, total, className }: ComposerCoverageBarProps) {
  if (total <= 0 || tagged <= 0) return null;
  const share = Math.min(1, tagged / total);
  return (
    <span
      role="img"
      aria-label={`Composer: ${tagged} of ${total} photos tagged`}
      title={`Composer: ${tagged} of ${total} photos tagged`}
      data-testid="composer-coverage"
      className={cn("pointer-events-auto absolute inset-x-0 bottom-0 block h-1 bg-black/35", className)}
    >
      <span className={cn("block h-full", share >= 1 ? "bg-emerald-400" : "bg-violet-400")} style={{ width: `${share * 100}%` }} />
    </span>
  );
}
