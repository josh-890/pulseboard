"use client";

import { useMemo } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CareerTimelineRow } from "@/lib/services/career-service";

// Career-tab right-panel idle state. Renders when no row is currently
// hovered/selected. Computes its stats from the already-fetched rows
// so filter changes are reflected — the card describes the current view.

type ChannelEntry = { id: string; name: string; count: number };

export type CareerSummaryCardProps = {
  rows: CareerTimelineRow[];
};

export function CareerSummaryCard({ rows }: CareerSummaryCardProps) {
  const stats = useMemo(() => computeStats(rows), [rows]);

  return (
    <div className="rounded-lg border border-white/10 bg-card/40 p-3">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Career summary
        </h3>
        <span className="text-[10px] text-muted-foreground/60">current view</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs italic text-muted-foreground/70">No sets in this view.</p>
      ) : (
        <div className="space-y-4">
          {/* Headline */}
          <div className="space-y-1">
            <div className="text-2xl font-semibold tabular-nums text-foreground">
              {stats.total}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                set{stats.total === 1 ? "" : "s"}
              </span>
            </div>
            {stats.yearRange && (
              <div className="text-[11px] text-muted-foreground">
                <span className="font-mono tabular-nums">{stats.yearRange.min}</span>
                <span className="mx-1 opacity-60">–</span>
                <span className="font-mono tabular-nums">{stats.yearRange.max}</span>
                <span className="ml-2 opacity-60">
                  · {stats.yearRange.max - stats.yearRange.min + 1} yr
                  {stats.yearRange.max - stats.yearRange.min === 0 ? "" : "s"}
                </span>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              <span className="text-emerald-500">{stats.promoted}</span>
              <span className="mx-1 opacity-60">·</span>
              <span className="text-amber-500">{stats.staged}</span>
              <span className="ml-2 opacity-60">promoted / staged</span>
            </div>
          </div>

          {/* Top channels */}
          {stats.topChannels.length > 0 && (
            <SummarySection title="Channels">
              <ul className="space-y-1">
                {stats.topChannels.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span
                      className="block h-1.5 rounded-full bg-primary/40"
                      style={{
                        width: `${Math.max(8, (c.count / stats.topChannels[0].count) * 60)}px`,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                      {c.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {c.count}
                    </span>
                  </li>
                ))}
                {stats.otherChannelsCount > 0 && (
                  <li className="pl-[44px] text-[10px] italic text-muted-foreground/60">
                    + {stats.otherChannelsCount} more
                  </li>
                )}
              </ul>
            </SummarySection>
          )}

          {/* Rating distribution */}
          {stats.hasRatings && (
            <SummarySection title="Ratings">
              <ul className="space-y-0.5">
                {[5, 4, 3, 2, 1].map((r) => {
                  const count = stats.ratingCounts[r] ?? 0;
                  const width =
                    stats.ratingMaxCount > 0
                      ? Math.max(4, (count / stats.ratingMaxCount) * 60)
                      : 4;
                  return (
                    <li key={r} className="flex items-center gap-2">
                      <span className="inline-flex w-[34px] items-center gap-0.5 text-[10px] text-amber-500">
                        {Array.from({ length: r }, (_, i) => (
                          <Star key={i} size={8} className="fill-amber-400 text-amber-400" />
                        ))}
                      </span>
                      <span
                        className={cn(
                          "block h-1 rounded-full",
                          count > 0 ? "bg-amber-400/60" : "bg-muted-foreground/15",
                        )}
                        style={{ width: `${width}px` }}
                      />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {count || "—"}
                      </span>
                    </li>
                  );
                })}
                {stats.unratedCount > 0 && (
                  <li className="flex items-center gap-2 pt-0.5">
                    <span className="inline-flex w-[34px] text-[10px] text-muted-foreground/60">
                      —
                    </span>
                    <span
                      className="block h-1 rounded-full bg-muted-foreground/30"
                      style={{
                        width: `${Math.max(4, (stats.unratedCount / stats.ratingMaxCount) * 60)}px`,
                      }}
                    />
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {stats.unratedCount}
                    </span>
                  </li>
                )}
              </ul>
            </SummarySection>
          )}

          <p className="border-t border-white/10 pt-3 text-[11px] italic text-muted-foreground/70">
            Hover a set to preview here.
          </p>
        </div>
      )}
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h4>
      {children}
    </div>
  );
}

type Stats = {
  total: number;
  promoted: number;
  staged: number;
  yearRange: { min: number; max: number } | null;
  topChannels: ChannelEntry[];
  otherChannelsCount: number;
  ratingCounts: Record<number, number>;
  ratingMaxCount: number;
  unratedCount: number;
  hasRatings: boolean;
};

function computeStats(rows: CareerTimelineRow[]): Stats {
  let promoted = 0;
  let staged = 0;
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  const channelMap = new Map<string, ChannelEntry>();
  const ratingCounts: Record<number, number> = {};
  let unratedCount = 0;
  let hasRatings = false;

  for (const row of rows) {
    if (row.kind === "promoted") promoted += 1;
    else staged += 1;

    const y = row.releaseDate?.getUTCFullYear();
    if (y && y > 0) {
      if (y < minYear) minYear = y;
      if (y > maxYear) maxYear = y;
    }

    if (row.channelId && row.channelName) {
      const existing = channelMap.get(row.channelId);
      if (existing) existing.count += 1;
      else channelMap.set(row.channelId, { id: row.channelId, name: row.channelName, count: 1 });
    }

    if (row.kind === "promoted") {
      if (row.rating === null) {
        unratedCount += 1;
      } else {
        ratingCounts[row.rating] = (ratingCounts[row.rating] ?? 0) + 1;
        hasRatings = true;
      }
    }
  }

  const sortedChannels = Array.from(channelMap.values()).sort((a, b) => b.count - a.count);
  const TOP = 5;
  const topChannels = sortedChannels.slice(0, TOP);
  const otherChannelsCount = sortedChannels.slice(TOP).reduce((sum, c) => sum + c.count, 0);

  const ratingMaxCount = Math.max(
    unratedCount,
    ...Object.values(ratingCounts),
    1,
  );

  return {
    total: rows.length,
    promoted,
    staged,
    yearRange:
      minYear === Number.POSITIVE_INFINITY ? null : { min: minYear, max: maxYear },
    topChannels,
    otherChannelsCount,
    ratingCounts,
    ratingMaxCount,
    unratedCount,
    hasRatings: hasRatings || unratedCount > 0,
  };
}
