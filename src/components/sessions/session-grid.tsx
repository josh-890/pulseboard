"use client";

import { useEffect, useState, useTransition } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { SessionCard } from "./session-card";
import { useDensity } from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadMoreSessions } from "@/lib/actions/session-actions";
import type { getSessions } from "@/lib/services/session-service";
import type { SessionFilters } from "@/lib/services/session-service";

type SessionItem = Awaited<ReturnType<typeof getSessions>>[number];

type SessionGridProps = {
  sessions: SessionItem[];
  photoMap: Record<string, string>;
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
      <div
        className={cn(
          "grid gap-4",
          isCompact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        )}
      >
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} photoUrl={photoMap[session.id]} />
        ))}
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
    </div>
  );
}
