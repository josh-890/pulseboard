"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TimelineSetRow } from "./timeline-set-row";
import { SetHoverPreview } from "./set-hover-preview";
import { SetPreviewPanel, SetPreviewPanelLoading } from "./set-preview-panel";
import { YearScrubber, type YearScrubberEntry } from "./year-scrubber";
import type {
  CareerTimelineRow,
  CareerHoverPreviewData,
} from "@/lib/services/career-service";

// Career timeline layout with two rendering modes governed by viewport width:
//
//  ≥ 1100px  → master-detail.  Three columns: timeline (capped ~760px)
//              | sticky preview panel (~360px) | narrowed year scrubber
//              (~60px). Hovering a row updates the panel; the panel
//              stays pinned on the last hovered row until the user
//              clicks "Summary" to restore the idle career-summary view.
//
//  < 1100px  → popover fallback.  Single timeline column + (optional)
//              year scrubber on the right. Hovering a row shows a
//              floating popover, the previously-shipped behaviour.
//
// Hover timing in panel mode: 300ms before the first activation
// (debounces flicks across the list); 100ms thereafter (snappy
// cross-fade once primed). No decay on mouse-leave — the panel keeps
// the last-hovered row pinned (Linear / Outlook / iCloud Photos
// convention).

export type TimelineSectionProps = {
  rows: CareerTimelineRow[];
  withTint: boolean;
  ageAtShoot?: (row: CareerTimelineRow) => string | null;
  eraLabelForYear?: (year: number) => string | null;
  fetchHoverPreview: (
    row: CareerTimelineRow,
  ) => Promise<CareerHoverPreviewData | null>;
  // Idle content for the right panel in master-detail mode (typically a
  // <CareerSummaryCard />). Ignored below the 1100px breakpoint.
  summaryNode?: React.ReactNode;
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
  fetchHoverPreview,
  summaryNode,
}: TimelineSectionProps) {
  const isPanelMode = useMediaQuery("(min-width: 1100px)");
  const groups = useMemo(() => groupByYear(rows), [rows]);
  const yearRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [activeYear, setActiveYear] = useState<number | undefined>(
    groups[0]?.year,
  );

  // Shared selection state — used by BOTH modes. In panel mode this is
  // the row whose preview is currently in the right panel. In popover
  // mode this is the row whose floating popover is open.
  const [selectedRow, setSelectedRow] = useState<CareerTimelineRow | null>(null);
  const [previewData, setPreviewData] = useState<CareerHoverPreviewData | null>(null);
  // Popover-only positioning state.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredKeyRef = useRef<string | null>(null);
  // Panel-mode hover priming: once activated, subsequent row hovers
  // cross-fade at 100ms instead of waiting the full 300ms.
  const isPanelPrimedRef = useRef(false);

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
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const handleHoverEnter = (row: CareerTimelineRow, e: React.MouseEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const key = rowKey(row);
    lastHoveredKeyRef.current = key;

    if (isPanelMode) {
      // Panel mode: snappy cross-fade once primed.
      const delay = isPanelPrimedRef.current ? 100 : 300;
      hoverTimerRef.current = setTimeout(async () => {
        if (lastHoveredKeyRef.current !== key) return;
        isPanelPrimedRef.current = true;
        setSelectedRow(row);
        setPreviewData(null);
        const data = await fetchHoverPreview(row);
        if (lastHoveredKeyRef.current === key) {
          setPreviewData(data);
        }
      }, delay);
      return;
    }

    // Popover mode: legacy floating-popover behaviour. Position is
    // computed relative to the row element with viewport-edge clamping.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimerRef.current = setTimeout(async () => {
      if (lastHoveredKeyRef.current !== key) return;
      const POPOVER_WIDTH = 420;
      const POPOVER_HEIGHT_ESTIMATE = 400;
      const MARGIN = 16;
      const rightOfRow = rect.right + 12;
      const fitsRight = rightOfRow + POPOVER_WIDTH <= window.innerWidth - MARGIN;
      const leftOfRow = rect.left - 12 - POPOVER_WIDTH;
      const fitsLeft = leftOfRow >= MARGIN;
      let leftPx: number;
      if (fitsRight) leftPx = rightOfRow;
      else if (fitsLeft) leftPx = leftOfRow;
      else leftPx = Math.max(MARGIN, window.innerWidth - POPOVER_WIDTH - MARGIN);
      const idealTop = rect.top;
      const maxTop = window.innerHeight - POPOVER_HEIGHT_ESTIMATE - MARGIN;
      const topPx = Math.max(MARGIN, Math.min(idealTop, maxTop));
      setSelectedRow(row);
      setPopoverPos({ top: topPx, left: leftPx });
      setPreviewData(null);
      const data = await fetchHoverPreview(row);
      if (lastHoveredKeyRef.current === key) {
        setPreviewData(data);
      }
    }, 300);
  };

  const handleHoverLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    lastHoveredKeyRef.current = null;

    if (isPanelMode) {
      // Panel mode: keep last-hovered row pinned (no decay back to summary).
      return;
    }

    // Popover mode: delay so user can move INTO the popover before it hides.
    hoverTimerRef.current = setTimeout(() => {
      setSelectedRow(null);
      setPreviewData(null);
      setPopoverPos(null);
    }, 120);
  };

  const handlePopoverEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  const handleBackToSummary = () => {
    setSelectedRow(null);
    setPreviewData(null);
    lastHoveredKeyRef.current = null;
  };

  // Note: we intentionally don't clear `selectedRow` / `previewData` on
  // breakpoint changes via useEffect (the React Compiler lint forbids
  // setState in an effect body). State self-heals on the next hover:
  //   - panel → popover: `popoverPos` is null until next hover, so the
  //     stale floating popover isn't shown. New hover sets both.
  //   - popover → panel: any previewData for that row is reused — the
  //     panel renders the same CareerHoverPreviewData shape the popover
  //     was using.

  const selectedKey = selectedRow ? rowKey(selectedRow) : null;

  // Build a stable "panel content" block for panel mode.
  const panelContent = (() => {
    if (!isPanelMode) return null;
    if (selectedRow) {
      if (previewData) {
        return (
          <SetPreviewPanel
            title={selectedRow.title}
            isVideo={selectedRow.type === "video"}
            previewData={previewData}
            href={
              selectedRow.kind === "promoted"
                ? `/sets/${selectedRow.setId}`
                : `/staging-sets?focus=${selectedRow.stagingSetId}`
            }
            linkLabel={selectedRow.kind === "promoted" ? "Open set" : "View in staging"}
            isStaged={selectedRow.kind === "staged"}
            onBackToSummary={handleBackToSummary}
          />
        );
      }
      return (
        <SetPreviewPanelLoading
          title={selectedRow.title}
          onBackToSummary={handleBackToSummary}
        />
      );
    }
    return summaryNode ?? null;
  })();

  return (
    <div className="flex gap-4">
      {/* Timeline column — capped in panel mode so the cluster sits next
          to the cover instead of stretching across the viewport. In
          popover mode the timeline reverts to flex-1 (existing behaviour). */}
      <div
        className={cn(
          "min-w-0 space-y-6",
          isPanelMode ? "w-[760px] shrink-0" : "flex-1",
        )}
      >
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
              {group.rows.map((row) => {
                const key = rowKey(row);
                return (
                  <div
                    key={key}
                    onMouseEnter={(e) => handleHoverEnter(row, e)}
                    onMouseLeave={handleHoverLeave}
                  >
                    <TimelineSetRow
                      row={row}
                      withTint={withTint}
                      ageAtShoot={ageAtShoot?.(row)}
                      isSelected={isPanelMode && selectedKey === key}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Right panel (panel mode only) */}
      {isPanelMode && panelContent && (
        <aside className="w-[360px] shrink-0">
          <div className="sticky top-16">{panelContent}</div>
        </aside>
      )}

      {/* Year scrubber */}
      {showScrubber && (
        <aside className="w-[60px] shrink-0">
          <YearScrubber
            entries={scrubberEntries}
            activeYear={activeYear}
            onYearClick={handleYearJump}
          />
        </aside>
      )}

      {/* Hover preview popover (popover mode only) */}
      {!isPanelMode && selectedRow && popoverPos && (
        <div
          className="pointer-events-auto fixed z-50"
          style={{ top: popoverPos.top, left: popoverPos.left }}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handleHoverLeave}
        >
          {previewData ? (
            <SetHoverPreview
              title={selectedRow.title}
              isVideo={selectedRow.type === "video"}
              previewData={previewData}
              href={
                selectedRow.kind === "promoted"
                  ? `/sets/${selectedRow.setId}`
                  : `/staging-sets?focus=${selectedRow.stagingSetId}`
              }
              linkLabel={selectedRow.kind === "promoted" ? "Open set" : "View in staging"}
              isStaged={selectedRow.kind === "staged"}
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
