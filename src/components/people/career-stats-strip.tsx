"use client";

import { Camera, Film, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CareerStats } from "@/lib/services/career-service";

export type CareerStatsStripProps = {
  stats: CareerStats;
};

type MetricRow = {
  key: "photosets" | "videos" | "covers";
  label: string;
  icon: React.ReactNode;
  claimed: number | null;
  promoted: number;
  staged: number;
};

// Compact "claimed vs promoted vs staged" gap view atop the Career tab.
// Each row compares what the biography claims against what we actually hold
// (promoted Sets + active-pipeline staging sets). Covers is the derived total.
export function CareerStatsStrip({ stats }: CareerStatsStripProps) {
  const rows: MetricRow[] = [
    {
      key: "photosets",
      label: "Photosets",
      icon: <Camera size={12} />,
      claimed: stats.claimed.photosets,
      promoted: stats.promoted.photos,
      staged: stats.staged.photos,
    },
    {
      key: "videos",
      label: "Videos",
      icon: <Film size={12} />,
      claimed: stats.claimed.videos,
      promoted: stats.promoted.videos,
      staged: stats.staged.videos,
    },
    {
      key: "covers",
      label: "Covers",
      icon: <Layers size={12} />,
      claimed: stats.claimed.covers,
      promoted: stats.promoted.covers,
      staged: stats.staged.covers,
    },
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-card/40 px-3 py-2.5">
      <div className="mb-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <span>Catalogue</span>
        <span className="text-right">Have / Claimed</span>
        <span className="text-right">Missing</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <StatRow key={r.key} row={r} />
        ))}
      </div>
    </div>
  );
}

function StatRow({ row }: { row: MetricRow }) {
  const have = row.promoted + row.staged;
  const hasClaim = row.claimed !== null && row.claimed > 0;
  const claimed = row.claimed ?? 0;

  const missing = hasClaim ? Math.max(0, claimed - have) : null;
  const over = hasClaim && have > claimed ? have - claimed : 0;
  const pct = hasClaim ? Math.min(100, Math.round((have / claimed) * 100)) : null;

  // Bar segments as % of the claimed total (capped so promoted+staged ≤ 100%).
  const promotedPct = hasClaim ? Math.min(100, (row.promoted / claimed) * 100) : 0;
  const stagedPct = hasClaim
    ? Math.min(100 - promotedPct, (row.staged / claimed) * 100)
    : 0;

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
      {/* Label */}
      <span className="flex w-24 items-center gap-1.5 text-xs text-muted-foreground">
        {row.icon}
        {row.label}
      </span>

      {/* Have / claimed + completeness bar */}
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 font-mono text-xs tabular-nums"
          title={`${row.promoted} promoted + ${row.staged} staged`}
        >
          <span className="font-semibold">{have}</span>
          {hasClaim && (
            <>
              <span className="text-muted-foreground/50">/{claimed}</span>
            </>
          )}
          <span className="ml-1 text-[10px] text-muted-foreground/60">
            ({row.promoted}+{row.staged})
          </span>
        </span>
        {hasClaim ? (
          <div
            className="relative h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted/40"
            role="progressbar"
            aria-valuenow={pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${row.label} completeness ${pct}%`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary"
              style={{ width: `${promotedPct}%` }}
            />
            <div
              className="absolute inset-y-0 bg-primary/40"
              style={{ left: `${promotedPct}%`, width: `${stagedPct}%` }}
            />
          </div>
        ) : (
          <span className="flex-1 text-[10px] italic text-muted-foreground/50">
            no claimed figure
          </span>
        )}
        {pct !== null && (
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tabular-nums",
              pct >= 100 ? "text-emerald-500" : "text-muted-foreground/70",
            )}
          >
            {pct}%
            {over > 0 && <span className="ml-0.5 text-amber-500">+{over}</span>}
          </span>
        )}
      </div>

      {/* Missing */}
      <span className="w-10 text-right font-mono text-xs tabular-nums">
        {missing === null ? (
          <span className="text-muted-foreground/30">—</span>
        ) : missing === 0 ? (
          <span className="text-emerald-500">0</span>
        ) : (
          <span className="text-amber-500">{missing}</span>
        )}
      </span>
    </div>
  );
}
