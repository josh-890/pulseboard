"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAppScrollEl } from "@/lib/scroll-container";
import { TimelineSetRow } from "./timeline-set-row";
import { SetHoverPreview, SET_HOVER_PREVIEW_DIMS } from "./set-hover-preview";
import { YearScrubber, type YearScrubberEntry } from "./year-scrubber";
import { GroupHeader } from "@/components/shared/group-header";
import {
  STATUS_DISPLAY_LABEL,
  type SetStatus,
} from "@/components/shared/status-pill";
import type {
  CareerTimelineRow,
  CareerRowStatus,
} from "@/lib/services/career-service";

// Career timeline: rows grouped by year (default), pipeline status, or
// channel→year (channels outer, years nested), with sticky collapsible group
// headers, collapse-all/expand-all, and — in year mode — an optional
// right-edge year scrubber (Apple Photos style). Hovering the SMALL cover
// thumbnail on a row pops an enlarged version of that cover (240×320 photos /
// 480×270 videos) anchored beside the cover. The full row remains a click
// target that navigates to the set page; the popover is purely visual
// confirmation, not an action.
//
// Why cover-only trigger: row-wide hover used to make the popover feel
// noisy when scanning, and the popover anchored at the row's right
// edge appeared far from the cursor on wide rows. Cover-only is
// precise: hand on the cover → popover next to it.

export type CareerGroupBy = "year" | "status" | "channelYear";

export type CareerDensity = "full" | "compact";

export type TimelineSectionProps = {
  rows: CareerTimelineRow[];
  withTint: boolean;
  groupBy?: CareerGroupBy;
  // "full" (default) renders cover cards; "compact" renders single-line rows
  // with a per-row expand affordance back to the full card.
  density?: CareerDensity;
  // localStorage key prefix for persisting collapsed sections. Collapse state
  // is stored per (person, groupBy) by the caller composing this key.
  collapseStorageKey?: string;
  ageAtShoot?: (row: CareerTimelineRow) => string | null;
  eraLabelForYear?: (year: number) => string | null;
};

// A renderable leaf: rows sharing a year (or the whole status/channel group in
// non-nested modes). `year` present ⇒ era chip + scrubber + active-year
// tracking apply.
type LeafGroup = {
  key: string;
  label: string;
  year?: number;
  rows: CareerTimelineRow[];
};

// A top-level section. In year/status modes it carries `rows` directly; in
// channelYear mode it carries `subgroups` (per-year leaves under a channel).
type Section = {
  key: string;
  label: string;
  count: number;
  year?: number;
  rows?: CareerTimelineRow[];
  subgroups?: LeafGroup[];
};

function yearOf(row: CareerTimelineRow): number {
  return row.releaseDate?.getUTCFullYear() ?? 0;
}

function groupRowsByYear(rows: CareerTimelineRow[]): LeafGroup[] {
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
  return years.map((year) => ({
    key: `y:${year}`,
    label: year > 0 ? String(year) : "Undated",
    year,
    rows: map.get(year)!,
  }));
}

// Fixed confidence order: canonical first, least-settled last.
const STATUS_ORDER: CareerRowStatus[] = [
  "promoted",
  "approved",
  "reviewing",
  "pending",
];

function groupRowsByStatus(rows: CareerTimelineRow[]): LeafGroup[] {
  const map = new Map<CareerRowStatus, CareerTimelineRow[]>();
  for (const r of rows) {
    const arr = map.get(r.rowStatus) ?? [];
    arr.push(r);
    map.set(r.rowStatus, arr);
  }
  return STATUS_ORDER.filter((s) => map.has(s)).map((s) => ({
    key: `s:${s}`,
    label: STATUS_DISPLAY_LABEL[s as SetStatus],
    rows: map.get(s)!,
  }));
}

function buildSections(
  rows: CareerTimelineRow[],
  groupBy: CareerGroupBy,
): Section[] {
  if (groupBy === "status") {
    return groupRowsByStatus(rows).map((g) => ({
      key: g.key,
      label: g.label,
      count: g.rows.length,
      rows: g.rows,
    }));
  }
  if (groupBy === "channelYear") {
    const byChannel = new Map<string, { name: string; rows: CareerTimelineRow[] }>();
    for (const r of rows) {
      const cid = r.channelId ?? "__none__";
      const name = r.channelName ?? "Unknown channel";
      const entry = byChannel.get(cid) ?? { name, rows: [] };
      entry.rows.push(r);
      byChannel.set(cid, entry);
    }
    return Array.from(byChannel.entries())
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([cid, entry]) => ({
        key: `c:${cid}`,
        label: entry.name,
        count: entry.rows.length,
        subgroups: groupRowsByYear(entry.rows).map((y) => ({
          ...y,
          key: `c:${cid}|${y.key}`,
        })),
      }));
  }
  // year
  return groupRowsByYear(rows).map((g) => ({
    key: g.key,
    label: g.label,
    count: g.rows.length,
    year: g.year,
    rows: g.rows,
  }));
}

const SCRUBBER_MIN_YEARS = 5;

function rowKey(row: CareerTimelineRow): string {
  return row.kind === "promoted" ? `p:${row.setId}` : `s:${row.stagingSetId}`;
}

export function TimelineSection({
  rows,
  withTint,
  groupBy = "year",
  density = "full",
  collapseStorageKey,
  ageAtShoot,
  eraLabelForYear,
}: TimelineSectionProps) {
  const sections = useMemo(() => buildSections(rows, groupBy), [rows, groupBy]);
  const yearRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [activeYear, setActiveYear] = useState<number | undefined>(
    sections[0]?.year,
  );

  // Collapse state — a set of collapsed group keys (top-level + nested),
  // restored from localStorage after mount (kept empty on first paint to avoid
  // a hydration mismatch).
  const storageKey = collapseStorageKey
    ? `${collapseStorageKey}.${groupBy}`
    : null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    let restored = new Set<string>();
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) restored = new Set(JSON.parse(saved) as string[]);
    } catch {
      restored = new Set();
    }
    // Hydration-safe restore: default (empty) on first paint, upgrade after
    // mount — same pattern as set-browse-nav-bar.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(restored);
  }, [storageKey]);

  const persistCollapsed = useCallback(
    (next: Set<string>) => {
      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey],
  );

  const toggleCollapse = useCallback(
    (key: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        persistCollapsed(next);
        return next;
      });
    },
    [persistCollapsed],
  );

  // Collapse-all / expand-all operate on top-level section keys (in
  // channelYear that folds every channel; nested year sub-groups keep their
  // own state).
  const collapseAll = useCallback(() => {
    const next = new Set(sections.map((s) => s.key));
    setCollapsed(next);
    persistCollapsed(next);
  }, [sections, persistCollapsed]);

  const expandAll = useCallback(() => {
    const next = new Set<string>();
    setCollapsed(next);
    persistCollapsed(next);
  }, [persistCollapsed]);

  // Per-row expand state (compact density only): rows the user has expanded
  // back to the full card. Transient — not persisted.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpandRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Cover-hover popover state. One popover at a time, positioned beside
  // the cover thumbnail that triggered it. Cleared when the cover is
  // unhovered (with a small grace window for stability).
  const [hoverRow, setHoverRow] = useState<CareerTimelineRow | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredKeyRef = useRef<string | null>(null);

  const scrubberEntries: YearScrubberEntry[] = useMemo(
    () =>
      groupBy === "year"
        ? sections
            .filter((s) => (s.year ?? 0) > 0)
            .map((s) => ({ year: s.year!, count: s.count }))
        : [],
    [sections, groupBy],
  );
  const showScrubber = scrubberEntries.length >= SCRUBBER_MIN_YEARS;

  useEffect(() => {
    if (typeof window === "undefined" || groupBy !== "year") return;
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
  }, [sections, groupBy]);

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

  const renderRows = (list: CareerTimelineRow[]) =>
    list.map((row) => {
      const key = rowKey(row);
      if (density === "compact") {
        const expanded = expandedRows.has(key);
        return (
          <div key={key} className="flex items-start gap-1">
            <button
              type="button"
              onClick={() => toggleExpandRow(key)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse to compact row" : "Expand to full card"}
              className="mt-1 flex shrink-0 items-center rounded p-0.5 text-muted-foreground/60 hover:bg-white/[0.05] hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <div className="min-w-0 flex-1">
              <TimelineSetRow
                row={row}
                withTint={withTint}
                variant={expanded ? "full" : "compact"}
                ageAtShoot={ageAtShoot?.(row)}
                onCoverEnter={(rect) => handleCoverEnter(row, rect)}
                onCoverLeave={handleCoverLeave}
              />
            </div>
          </div>
        );
      }
      return (
        <TimelineSetRow
          key={key}
          row={row}
          withTint={withTint}
          variant="full"
          ageAtShoot={ageAtShoot?.(row)}
          onCoverEnter={(rect) => handleCoverEnter(row, rect)}
          onCoverLeave={handleCoverLeave}
        />
      );
    });

  return (
    <div className={cn("flex gap-3", showScrubber ? "pr-2" : "")}>
      <div className="min-w-0 flex-1 space-y-3">
        {/* Collapse-all / expand-all */}
        {sections.length > 1 && (
          <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={collapseAll}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/[0.05] hover:text-foreground transition-colors"
            >
              <ChevronsDownUp size={12} />
              Collapse all
            </button>
            <button
              type="button"
              onClick={expandAll}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/[0.05] hover:text-foreground transition-colors"
            >
              <ChevronsUpDown size={12} />
              Expand all
            </button>
          </div>
        )}

        <div className="space-y-6">
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            const isYear = section.year !== undefined;
            return (
              <section key={section.key} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleCollapse(section.key)}
                  ref={(el) => {
                    if (!isYear || section.year === undefined) return;
                    if (el) yearRefs.current.set(section.year, el);
                    else yearRefs.current.delete(section.year);
                  }}
                  data-year={isYear ? section.year : undefined}
                  aria-expanded={!isCollapsed}
                  className={cn(
                    "sticky top-[var(--toolbar-h,0px)] z-10 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-md bg-background/85 px-2 py-1.5 text-left",
                    "border-b border-white/10 backdrop-blur-md transition-colors hover:bg-background/95",
                    "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  )}
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="shrink-0 opacity-70" />
                  ) : (
                    <ChevronDown size={12} className="shrink-0 opacity-70" />
                  )}
                  <span className="font-mono tabular-nums text-foreground">
                    {section.label}
                  </span>
                  {isYear && section.year !== undefined && eraLabelForYear?.(section.year) && (
                    <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                      {eraLabelForYear(section.year)}
                    </span>
                  )}
                  <span className="text-[10px] opacity-70">
                    {section.count} set{section.count === 1 ? "" : "s"}
                  </span>
                </button>

                {!isCollapsed &&
                  (section.subgroups ? (
                    <div className="space-y-3 pl-1">
                      {section.subgroups.map((sg) => {
                        const sgCollapsed = collapsed.has(sg.key);
                        return (
                          <div key={sg.key} className="space-y-1.5">
                            <GroupHeader
                              label={sg.label}
                              count={sg.rows.length}
                              level={2}
                              collapsed={sgCollapsed}
                              onToggle={() => toggleCollapse(sg.key)}
                            />
                            {!sgCollapsed && (
                              <div className="space-y-1.5">{renderRows(sg.rows)}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1.5">{renderRows(section.rows ?? [])}</div>
                  ))}
              </section>
            );
          })}
        </div>
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
