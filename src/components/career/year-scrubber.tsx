"use client";

import { cn } from "@/lib/utils";

// Right-edge year navigator (Apple Photos style). Click a year to jump
// the timeline. Each row shows the year + a small density bar reflecting
// the count of sets in that year (relative to the busiest year), plus
// the absolute count.
//
// The parent owns the scroll target — the scrubber just emits clicks.
// Conditionally rendered: parent should skip mounting when years.length
// is small (locked threshold: < 5).

export type YearScrubberEntry = {
  year: number;
  count: number;
};

export type YearScrubberProps = {
  entries: YearScrubberEntry[];
  activeYear?: number;
  onYearClick: (year: number) => void;
};

export function YearScrubber({ entries, activeYear, onYearClick }: YearScrubberProps) {
  if (entries.length === 0) return null;
  const maxCount = Math.max(1, ...entries.map((e) => e.count));

  return (
    <nav
      aria-label="Year navigator"
      className="sticky top-20 flex max-h-[calc(100vh-8rem)] flex-col gap-0.5 overflow-y-auto pl-2 pr-1"
    >
      {entries.map((e) => {
        const isActive = e.year === activeYear;
        const widthPct = Math.max(8, (e.count / maxCount) * 100);
        return (
          <button
            key={e.year}
            type="button"
            onClick={() => onYearClick(e.year)}
            className={cn(
              "group flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px]",
              "transition-colors",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
            title={`${e.year} · ${e.count} set${e.count === 1 ? "" : "s"}`}
          >
            <span className="w-9 shrink-0 font-mono tabular-nums">{e.year}</span>
            <span className="flex h-1.5 w-12 shrink-0 items-center">
              <span
                className={cn(
                  "block h-1 rounded-full",
                  isActive ? "bg-primary/80" : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50",
                )}
                style={{ width: `${widthPct}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums opacity-60">
              {e.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
