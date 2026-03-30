"use client";

import { useEffect, useState, useTransition } from "react";
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

type SessionItem = Awaited<ReturnType<typeof getSessions>>[number];

type CoverPhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type SessionGridProps = {
  sessions: SessionItem[];
  photoMap: Record<string, CoverPhotoData>;
  nextCursor: string | null;
  totalCount: number;
  filters: SessionFilters;
};

export function SessionGrid({
  sessions: initialSessions,
  photoMap: initialPhotoMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
}: SessionGridProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const [sessions, setSessions] = useState(initialSessions);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const bulk = useBulkSelection();

  useEffect(() => { setSessions(initialSessions); }, [initialSessions]);
  useEffect(() => { setPhotoMap(initialPhotoMap); }, [initialPhotoMap]);
  useEffect(() => { setCursor(initialCursor); }, [initialCursor]);

  function handleLoadMore() {
    if (!cursor) return;
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
      setCursor(result.nextCursor);
    });
  }

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
              <div className={cn(bulk.isSelecting && isSelected && "ring-2 ring-primary rounded-xl")}>
                <SessionCard session={session} coverPhoto={photoMap[session.id]} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more footer */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Showing {sessions.length} of {totalCount}{" "}
          {totalCount === 1 ? "session" : "sessions"}
        </p>
        {cursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Loading…
              </>
            ) : (
              "Load more (50)"
            )}
          </Button>
        )}
      </div>

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
