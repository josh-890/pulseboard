"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CareerStats } from "@/lib/services/career-service";

export type CareerStatsStripProps = {
  stats: CareerStats;
};

type MetricRow = {
  key: "photosets" | "videos" | "covers";
  label: string;
  claimed: number | null;
  promoted: number;
  staged: number;
};

// Compact, collapsed-by-default "claimed vs promoted vs staged" gap table.
// Covers is the derived total (photosets + videos). Numbers only — no bars.
export function CareerStatsStrip({ stats }: CareerStatsStripProps) {
  const [open, setOpen] = useState(false);

  const rows: MetricRow[] = [
    {
      key: "photosets",
      label: "Photosets",
      claimed: stats.claimed.photosets,
      promoted: stats.promoted.photos,
      staged: stats.staged.photos,
    },
    {
      key: "videos",
      label: "Videos",
      claimed: stats.claimed.videos,
      promoted: stats.promoted.videos,
      staged: stats.staged.videos,
    },
    {
      key: "covers",
      label: "Covers",
      claimed: stats.claimed.covers,
      promoted: stats.promoted.covers,
      staged: stats.staged.covers,
    },
  ];

  const covers = rows[2];
  const haveCovers = covers.promoted + covers.staged;
  const pct =
    covers.claimed && covers.claimed > 0
      ? Math.min(100, Math.round((haveCovers / covers.claimed) * 100))
      : null;

  return (
    <div className="rounded-md border border-white/10 bg-card/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronRight
          size={13}
          className={cn("text-muted-foreground/60 transition-transform", open && "rotate-90")}
        />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Catalogue
        </span>
        <span className="ml-auto font-mono tabular-nums text-muted-foreground/80">
          {covers.claimed !== null
            ? `${haveCovers} / ${covers.claimed} covers${pct !== null ? ` · ${pct}%` : ""}`
            : `${haveCovers} covers held`}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-3 py-2">
          <div className="grid w-fit grid-cols-[auto_repeat(4,3.5rem)] gap-x-6 gap-y-1">
            <span />
            <HeaderCell>Claimed</HeaderCell>
            <HeaderCell>Promoted</HeaderCell>
            <HeaderCell>Staged</HeaderCell>
            <HeaderCell>Missing</HeaderCell>
            {rows.map((r) => (
              <StatRow key={r.key} row={r} total={r.key === "covers"} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
      {children}
    </span>
  );
}

function StatRow({ row, total }: { row: MetricRow; total: boolean }) {
  const have = row.promoted + row.staged;
  const hasClaim = row.claimed !== null;
  const missing = hasClaim ? Math.max(0, (row.claimed ?? 0) - have) : null;

  const cell = "text-right font-mono tabular-nums";
  const border = total ? "border-t border-white/10 pt-1 mt-0.5" : "";

  return (
    <>
      <span className={cn("text-muted-foreground", total && "font-medium text-foreground", border)}>
        {row.label}
      </span>
      <span className={cn(cell, border, "text-muted-foreground")}>
        {row.claimed ?? "—"}
      </span>
      <span className={cn(cell, border)}>{row.promoted}</span>
      <span className={cn(cell, border)}>{row.staged}</span>
      <span
        className={cn(
          cell,
          border,
          missing === null
            ? "text-muted-foreground/40"
            : missing === 0
              ? "text-emerald-500"
              : "text-amber-500",
        )}
      >
        {missing ?? "—"}
      </span>
    </>
  );
}
