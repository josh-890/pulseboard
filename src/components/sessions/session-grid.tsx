"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Clapperboard, Loader2, CheckSquare } from "lucide-react";
import { SessionCard } from "./session-card";
import { useDensity } from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadMoreSessions } from "@/lib/actions/session-actions";
import type { getSessions } from "@/lib/services/session-service";
import type { SessionFilters } from "@/lib/services/session-service";
import { useBulkSelection } from "@/hooks/use-bulk-selection";
import { BulkSelectionBar } from "@/components/shared/bulk-selection-bar";
import {
  saveBrowseContext,
  loadBrowseContext,
  updateBrowseScrollY,
  truncateName,
  filtersMatch,
  SESSION_BROWSE_KEY,
} from "@/lib/browse-context";

type SessionItem = Awaited<ReturnType<typeof getSessions>>[number];

function filtersToRecord(filters: SessionFilters): Record<string, string> {
  const r: Record<string, string> = {};
  if (filters.q) r.q = filters.q;
  if (filters.status) r.status = filters.status;
  if (filters.labelId) r.label = filters.labelId;
  if (filters.projectId) r.project = filters.projectId;
  if (filters.personId) r.personId = filters.personId;
  if (filters.sort) r.sort = filters.sort;
  if (filters.dateFrom) r.dateFrom = filters.dateFrom.toISOString().split("T")[0];
  if (filters.dateTo) r.dateTo = filters.dateTo.toISOString().split("T")[0];
  if (filters.createdFrom) r.createdFrom = filters.createdFrom.toISOString().split("T")[0];
  if (filters.createdTo) r.createdTo = filters.createdTo.toISOString().split("T")[0];
  return r;
}

type CoverPhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type HeadshotData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type SessionGridProps = {
  sessions: SessionItem[];
  photoMap: Record<string, CoverPhotoData>;
  headshotMap: Record<string, HeadshotData>;
  nextCursor: string | null;
  totalCount: number;
  filters: SessionFilters;
};

export function SessionGrid({
  sessions: initialSessions,
  photoMap: initialPhotoMap,
  headshotMap: initialHeadshotMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
}: SessionGridProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const [sessions, setSessions] = useState(initialSessions);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [headshotMap, setHeadshotMap] = useState(initialHeadshotMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const hasRestoredScroll = useRef(false);
  const isInitialMount = useRef(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreFnRef = useRef<() => void>(() => {});
  const bulk = useBulkSelection();

  useEffect(() => { setSessions(initialSessions); }, [initialSessions]);
  useEffect(() => { setPhotoMap(initialPhotoMap); }, [initialPhotoMap]);
  useEffect(() => { setHeadshotMap(initialHeadshotMap); }, [initialHeadshotMap]);
  useEffect(() => { setCursor(initialCursor); }, [initialCursor]);

  // Restore scroll on return from detail page
  useEffect(() => {
    if (hasRestoredScroll.current) return;
    hasRestoredScroll.current = true;
    const ctx = loadBrowseContext(SESSION_BROWSE_KEY);
    if (!ctx) return;
    if (!filtersMatch(filtersToRecord(filters), ctx.filters)) return;
    if (ctx.scrollY > 0) {
      requestAnimationFrame(() => { window.scrollTo(0, ctx.scrollY); });
    }
  }, [filters]);

  const saveBrowseContextFromState = useCallback(
    (current: SessionItem[], cur: string | null) => {
      saveBrowseContext(
        {
          ids: current.map((s) => s.id),
          names: current.map((s) => truncateName(s.name)),
          nextCursor: cur,
          totalCount,
          filters: filtersToRecord(filters),
          scrollY: 0,
        },
        SESSION_BROWSE_KEY,
      );
    },
    [totalCount, filters],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const ctx = loadBrowseContext(SESSION_BROWSE_KEY);
      if (ctx && filtersMatch(filtersToRecord(filters), ctx.filters) && ctx.ids.length >= sessions.length) {
        return;
      }
    }
    saveBrowseContextFromState(sessions, cursor);
  }, [sessions, cursor, saveBrowseContextFromState, filters]);

  function handleCardClick() {
    updateBrowseScrollY(window.scrollY, SESSION_BROWSE_KEY);
  }

  const handleLoadMore = useCallback(() => {
    if (!cursor || isPending) return;
    startTransition(async () => {
      const result = await loadMoreSessions(filters, cursor);
      setSessions((prev) => {
        const next = [...prev, ...(result.items as SessionItem[])];
        const url = new URL(window.location.href);
        url.searchParams.set("loaded", String(next.length));
        window.history.replaceState(null, "", url.toString());
        return next;
      });
      setPhotoMap((prev) => ({ ...prev, ...result.photoMap }));
      setHeadshotMap((prev) => ({ ...prev, ...result.headshotMap }));
      setCursor(result.nextCursor);
    });
  }, [cursor, isPending, filters]);

  // Keep ref in sync so the observer always calls the latest version
  useEffect(() => { loadMoreFnRef.current = handleLoadMore; });

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreFnRef.current(); },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clapperboard size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No sessions found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Sessions are created automatically when you add a set.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Select mode toggle */}
      <div className="flex justify-end">
        <Button
          variant={bulk.isSelecting ? "default" : "outline"}
          size="sm"
          onClick={() => bulk.isSelecting ? bulk.exitSelection() : bulk.setSelecting(true)}
        >
          <CheckSquare size={14} className="mr-1.5" />
          {bulk.isSelecting ? "Cancel" : "Select"}
        </Button>
      </div>

      <div
        className={cn(
          "grid gap-4",
          isCompact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        )}
      >
        {sessions.map((session) => {
          const isSelected = bulk.selectedIds.has(session.id);
          return (
            <div key={session.id} className="relative">
              {bulk.isSelecting && (
                <button
                  type="button"
                  onClick={() => bulk.toggle(session.id)}
                  className={cn(
                    "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/70 bg-black/30 backdrop-blur-sm",
                  )}
                >
                  {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
                </button>
              )}
              <div
                className={cn(bulk.isSelecting && isSelected && "ring-2 ring-primary rounded-xl")}
                onClick={bulk.isSelecting ? undefined : handleCardClick}
              >
                <SessionCard session={session} coverPhoto={photoMap[session.id]} headshotMap={headshotMap} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Count + infinite scroll sentinel */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Showing {sessions.length} of {totalCount}{" "}
          {totalCount === 1 ? "session" : "sessions"}
        </p>
        {isPending && <Loader2 size={18} className="animate-spin text-muted-foreground/50" />}
      </div>
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />

      {/* Bulk selection bar */}
      {bulk.isSelecting && (
        <BulkSelectionBar
          selectedIds={bulk.selectedIds}
          entityType="SESSION"
          scope="SESSION"
          onClear={bulk.clear}
          totalCount={totalCount}
          onSelectAll={() => bulk.selectAll(sessions.map((s) => s.id))}
        />
      )}
    </div>
  );
}
