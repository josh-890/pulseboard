"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getAppScrollEl } from "@/lib/scroll-container";
import { TimelineSetRow } from "./timeline-set-row";
import { SetHoverPreview, SET_HOVER_PREVIEW_DIMS } from "./set-hover-preview";
import { YearScrubber, type YearScrubberEntry } from "./year-scrubber";
import type { CareerTimelineRow } from "@/lib/services/career-service";

// Career timeline: rows grouped by year with sticky year headers and an
// optional right-edge year scrubber (Apple Photos style). Hovering the
// SMALL cover thumbnail on a row pops an enlarged version of that cover
// (240×320 photos / 480×270 videos) anchored beside the cover. The full
// row remains a click target that navigates to the set page; the
// popover is purely visual confirmation, not an action.
//
// Why cover-only trigger: row-wide hover used to make the popover feel
// noisy when scanning, and the popover anchored at the row's right
// edge appeared far from the cursor on wide rows. Cover-only is
// precise: hand on the cover → popover next to it.

export type TimelineSectionProps = {
  rows: CareerTimelineRow[];
  withTint: boolean;
  ageAtShoot?: (row: CareerTimelineRow) => string | null;
  eraLabelForYear?: (year: number) => string | null;
};

type YearGroup = {
  year: number;
  rows: CareerTimelineRow[];
};

function yearOf(row: CareerTimelineRow): number {
  return row.releaseDate?.getUTCFullYear() ?? 0;
}

function groupByYear(rows: CareerTimelineRow[]): YearGroup[] {
  const map = new Map<number, CareerTimelineRow[]>();
  for (const r of rows) {
    const y = yearOf(r);
    const arr = map.get(y) ?? [];
    arr.push(r);
    map.set(y, arr);
  }
  const firstIndex = new Map<number, number>();
  rows.forEach((r, i) => {
    const y = yearOf(r);
    if (!firstIndex.has(y)) firstIndex.set(y, i);
  });
  const years = Array.from(map.keys()).sort(
    (a, b) => (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0),
  );
  return years.map((year) => ({ year, rows: map.get(year)! }));
}

const SCRUBBER_MIN_YEARS = 5;

function rowKey(row: CareerTimelineRow): string {
  return row.kind === "promoted" ? `p:${row.setId}` : `s:${row.stagingSetId}`;
}

export function TimelineSection({
  rows,
  withTint,
  ageAtShoot,
  eraLabelForYear,
}: TimelineSectionProps) {
  const groups = useMemo(() => groupByYear(rows), [rows]);
  const yearRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [activeYear, setActiveYear] = useState<number | undefined>(
    groups[0]?.year,
  );

  // Cover-hover popover state. One popover at a time, positioned beside
  // the cover thumbnail that triggered it. Cleared when the cover is
  // unhovered (with a small grace window for stability).
  const [hoverRow, setHoverRow] = useState<CareerTimelineRow | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredKeyRef = useRef<string | null>(null);

  const scrubberEntries: YearScrubberEntry[] = useMemo(
    () => groups.filter((g) => g.year > 0).map((g) => ({ year: g.year, count: g.rows.length })),
    [groups],
  );
  const showScrubber = scrubberEntries.length >= SCRUBBER_MIN_YEARS;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) =>
          Math.abs(a.boundingClientRect.top) < Math.abs(b.boundingClientRect.top) ? a : b,
        );
        const year = Number(top.target.getAttribute("data-year"));
        if (!Number.isNaN(year)) setActiveYear(year);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 1] },
    );
    yearRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [groups]);

  const handleYearJump = (year: number) => {
    const el = yearRefs.current.get(year);
    const container = getAppScrollEl();
    if (!el || !container) return;
    // Position relative to the content scroll container (the window no
    // longer scrolls); -8 leaves a hair of room above the sticky header.
    const top =
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      8;
    container.scrollTo({ top, behavior: "smooth" });
  };

  // Called by TimelineSetRow when the user hovers a cover. `coverRect`
  // is the cover thumbnail's bounding box (viewport coords). We compute
  // a position to the right of the cover, falling back to the left or
  // pinned to the viewport edge when out of room.
  const handleCoverEnter = (row: CareerTimelineRow, coverRect: DOMRect) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const key = rowKey(row);
    lastHoveredKeyRef.current = key;
    hoverTimerRef.current = setTimeout(() => {
      if (lastHoveredKeyRef.current !== key) return;
      const dims = SET_HOVER_PREVIEW_DIMS[row.type === "video" ? "video" : "photo"];
      const MARGIN = 16;
      const GAP = 8;
      const rightOfCover = coverRect.right + GAP;
      const fitsRight = rightOfCover + dims.width <= window.innerWidth - MARGIN;
      const leftOfCover = coverRect.left - GAP - dims.width;
      const fitsLeft = leftOfCover >= MARGIN;
      let leftPx: number;
      if (fitsRight) leftPx = rightOfCover;
      else if (fitsLeft) leftPx = leftOfCover;
      else leftPx = Math.max(MARGIN, window.innerWidth - dims.width - MARGIN);
      // Vertically: align top of popover with top of cover, clamp to
      // viewport.
      const idealTop = coverRect.top;
      const maxTop = window.innerHeight - dims.height - MARGIN;
      const topPx = Math.max(MARGIN, Math.min(idealTop, maxTop));
      setHoverRow(row);
      setHoverPos({ top: topPx, left: leftPx });
    }, 300);
  };

  const handleCoverLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    lastHoveredKeyRef.current = null;
    // Small grace window so brief cursor flicks don't strobe the popover.
    hoverTimerRef.current = setTimeout(() => {
      setHoverRow(null);
      setHoverPos(null);
    }, 100);
  };

  return (
    <div className={cn("flex gap-3", showScrubber ? "pr-2" : "")}>
      <div className="min-w-0 flex-1 space-y-6">
        {groups.map((group) => (
          <section key={group.year} className="space-y-1.5">
            <header
              ref={(el) => {
                if (el) yearRefs.current.set(group.year, el);
                else yearRefs.current.delete(group.year);
              }}
              data-year={group.year}
              className={cn(
                "sticky top-[var(--toolbar-h,0px)] z-10 -mx-1 flex items-center gap-2 rounded-md bg-background/85 px-2 py-1.5",
                "border-b border-white/10 backdrop-blur-md",
                "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
              )}
            >
              <span className="font-mono tabular-nums text-foreground">
                {group.year > 0 ? group.year : "Undated"}
              </span>
              {eraLabelForYear?.(group.year) && (
                <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                  {eraLabelForYear(group.year)}
                </span>
              )}
              <span className="text-[10px] opacity-70">
                {group.rows.length} set{group.rows.length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="space-y-1.5">
              {group.rows.map((row) => (
                <TimelineSetRow
                  key={rowKey(row)}
                  row={row}
                  withTint={withTint}
                  ageAtShoot={ageAtShoot?.(row)}
                  onCoverEnter={(rect) => handleCoverEnter(row, rect)}
                  onCoverLeave={handleCoverLeave}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {showScrubber && (
        <aside className="w-[60px] shrink-0">
          <YearScrubber
            entries={scrubberEntries}
            activeYear={activeYear}
            onYearClick={handleYearJump}
          />
        </aside>
      )}

      {/* Cover-hover popover */}
      {hoverRow && hoverPos && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ top: hoverPos.top, left: hoverPos.left }}
        >
          <SetHoverPreview
            coverUrl={hoverRow.coverUrl}
            isVideo={hoverRow.type === "video"}
          />
        </div>
      )}
    </div>
  );
}
