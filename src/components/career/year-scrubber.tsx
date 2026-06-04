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
      className="sticky top-20 flex max-h-[calc(100vh-8rem)] flex-col gap-0.5 overflow-y-auto pr-0.5"
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
              "group relative flex items-center overflow-hidden rounded px-1.5 py-1 text-left text-[10px]",
              "transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={`${e.year} · ${e.count} set${e.count === 1 ? "" : "s"}`}
          >
            {/* Density fill — fills the button background from the left,
                width proportional to that year's count vs the busiest year.
                Sits behind the year label (z-0). */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0 left-0 transition-colors",
                isActive
                  ? "bg-primary/20"
                  : "bg-muted-foreground/10 group-hover:bg-muted-foreground/20",
              )}
              style={{ width: `${widthPct}%` }}
            />
            <span className="relative z-10 font-mono tabular-nums">{e.year}</span>
          </button>
        );
      })}
    </nav>
  );
}
