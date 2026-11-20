import { cn } from "@/lib/utils";
import { toneBucketOf, toneCountsLabel, type ToneCounts } from "@/lib/tone";

export type ToneBadgeProps = {
  counts: ToneCounts | undefined;
  className?: string;
};

const R = 7;
const C = 2 * Math.PI * R;

/**
 * Color / B&W on a set card (ADR-0041): nothing for color only, a grey disc for
 * B&W only, a pie whose grey slice is the B&W share for mixed.
 */
export function ToneBadge({ counts, className }: ToneBadgeProps) {
  if (!counts) return null;
  const bucket = toneBucketOf(counts);
  if (bucket === null || bucket === "color") return null;
  const label = toneCountsLabel(counts);
  // The slice: at least a sliver, at most just short of full, so mixed never reads as all or nothing
  const share = bucket === "mono" ? 1 : Math.min(0.94, Math.max(0.06, counts.mono / counts.total));

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="tone-badge"
      data-tone={bucket}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-full bg-black/45 shadow-sm ring-1 ring-white/25 backdrop-blur-sm",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
        <defs>
          <linearGradient id="tone-badge-color" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="35%" stopColor="#f59e0b" />
            <stop offset="65%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="tone-badge-grey" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5f5f5" />
            <stop offset="100%" stopColor="#6b6b6b" />
          </linearGradient>
        </defs>
        {bucket === "mixed" && <circle cx="10" cy="10" r={R} fill="url(#tone-badge-color)" />}
        <circle
          cx="10"
          cy="10"
          r={R / 2}
          fill="none"
          stroke="url(#tone-badge-grey)"
          strokeWidth={R}
          strokeDasharray={`${share * (C / 2)} ${C / 2}`}
          transform="rotate(-90 10 10)"
        />
      </svg>
    </span>
  );
}
