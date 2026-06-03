"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TimelineSetRow } from "./timeline-set-row";
import { SetHoverPreview } from "./set-hover-preview";
import { YearScrubber, type YearScrubberEntry } from "./year-scrubber";
import type {
  CareerTimelineRow,
  CareerHoverPreviewData,
} from "@/lib/services/career-service";

// Container for the Career timeline: rows grouped by year with sticky
// year headers (CSS sticky), optional right-edge year scrubber for fast
// year-jumping (Apple Photos style), and lazy on-hover preview popover.
//
// Virtualisation deferred — at our current scales (xpulse outlier: 350
// rows for Cara Mell), DOM bloat is manageable with lazy-loaded covers
// (Next.js Image `loading="lazy"`). Threshold for retrofitting
// virtualisation: ~1000 rows / person.

export type TimelineSectionProps = {
  rows: CareerTimelineRow[];
  withTint: boolean;
  ageAtShoot?: (row: CareerTimelineRow) => string | null;
  // Era display for a year header — returns a label like "post-surgery era"
  // or null. Called per year-section header.
  eraLabelForYear?: (year: number) => string | null;
  // Async hover-preview fetcher. Implemented by the consuming page using
  // the server actions. Returns null when not available.
  fetchHoverPreview: (
    row: CareerTimelineRow,
  ) => Promise<CareerHoverPreviewData | null>;
};

type YearGroup = {
  year: number;
  rows: CareerTimelineRow[];
};

function yearOf(row: CareerTimelineRow): number {
  return row.releaseDate?.getUTCFullYear() ?? 0; // 0 sentinel for undated
}

function groupByYear(rows: CareerTimelineRow[]): YearGroup[] {
  const map = new Map<number, CareerTimelineRow[]>();
  for (const r of rows) {
    const y = yearOf(r);
    const arr = map.get(y) ?? [];
    arr.push(r);
    map.set(y, arr);
  }
  // Preserve the sort order of the incoming rows. Map iteration follows
  // insertion order; the first occurrence of each year fixes that year's
  // position. So we sort the year keys by the first occurrence index in
  // the input.
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

export function TimelineSection({
  rows,
  withTint,
  ageAtShoot,
  eraLabelForYear,
  fetchHoverPreview,
}: TimelineSectionProps) {
  const groups = useMemo(() => groupByYear(rows), [rows]);
  const yearRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [activeYear, setActiveYear] = useState<number | undefined>(
    groups[0]?.year,
  );

  // Hover preview state — lazily fetched on row hover with a 300ms delay.
  const [hoverRow, setHoverRow] = useState<CareerTimelineRow | null>(null);
  const [hoverData, setHoverData] = useState<CareerHoverPreviewData | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredKeyRef = useRef<string | null>(null);

  // Year-scrubber entries
  const scrubberEntries: YearScrubberEntry[] = useMemo(
    () => groups.filter((g) => g.year > 0).map((g) => ({ year: g.year, count: g.rows.length })),
    [groups],
  );
  const showScrubber = scrubberEntries.length >= SCRUBBER_MIN_YEARS;

  // Track which year section is currently at the top of the viewport.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Among intersecting headers, pick the one closest to top of viewport.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // Sort by boundingClientRect.top ascending (closest to 0 = at top)
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
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const handleHoverEnter = (row: CareerTimelineRow, e: React.MouseEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const key = rowKey(row);
    lastHoveredKeyRef.current = key;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimerRef.current = setTimeout(async () => {
      // Guard: cursor may have moved on before timer fires.
      if (lastHoveredKeyRef.current !== key) return;
      setHoverRow(row);
      setHoverPos({
        top: rect.top + window.scrollY,
        left: rect.right + window.scrollX + 12,
      });
      const data = await fetchHoverPreview(row);
      if (lastHoveredKeyRef.current === key) {
        setHoverData(data);
      }
    }, 300);
  };

  const handleHoverLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    lastHoveredKeyRef.current = null;
    // Delay clearing so the user has time to move into the popover.
    hoverTimerRef.current = setTimeout(() => {
      setHoverRow(null);
      setHoverData(null);
      setHoverPos(null);
    }, 120);
  };

  const handlePopoverEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
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
                "sticky top-16 z-10 -mx-1 flex items-center gap-2 rounded-md bg-background/85 px-2 py-1.5",
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
                <div
                  key={rowKey(row)}
                  onMouseEnter={(e) => handleHoverEnter(row, e)}
                  onMouseLeave={handleHoverLeave}
                >
                  <TimelineSetRow
                    row={row}
                    withTint={withTint}
                    ageAtShoot={ageAtShoot?.(row)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {showScrubber && (
        <aside className="w-[120px] shrink-0">
          <YearScrubber
            entries={scrubberEntries}
            activeYear={activeYear}
            onYearClick={handleYearJump}
          />
        </aside>
      )}

      {/* Hover preview popover */}
      {hoverRow && hoverPos && (
        <div
          className="pointer-events-auto fixed z-50"
          style={{ top: hoverPos.top, left: hoverPos.left }}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handleHoverLeave}
        >
          {hoverData ? (
            <SetHoverPreview
              title={hoverRow.title}
              isVideo={hoverRow.type === "video"}
              previewData={hoverData}
              href={
                hoverRow.kind === "promoted"
                  ? `/sets/${hoverRow.setId}`
                  : `/staging-sets?focus=${hoverRow.stagingSetId}`
              }
              linkLabel={hoverRow.kind === "promoted" ? "Open set" : "View in staging"}
              isStaged={hoverRow.kind === "staged"}
            />
          ) : (
            <div className="w-[420px] rounded-lg border border-white/15 bg-popover/95 p-3 text-xs text-muted-foreground italic shadow-xl backdrop-blur-sm">
              Loading preview…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function rowKey(row: CareerTimelineRow): string {
  return row.kind === "promoted" ? `p:${row.setId}` : `s:${row.stagingSetId}`;
}
