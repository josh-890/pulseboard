"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addExistingMediaToSetAction } from "@/lib/actions/set-actions";
import { MediaPickerShell, type PickerItem } from "@/components/media/media-picker-shell";

type MediaSearchResult = {
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  thumbUrl: string;
  previewUrl?: string;
  zoomUrl?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  sessionId: string | null;
  sessionName: string | null;
  persons: { id: string; icgId: string; name: string | null }[];
  createdAt: string;
};

type SessionLink = {
  sessionId: string;
  sessionName: string;
};

type MediaPickerSheetProps = {
  setId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionLinks?: SessionLink[];
};

function toPickerItem(r: MediaSearchResult): PickerItem {
  return {
    id: r.id,
    thumbUrl: r.thumbUrl,
    previewUrl: r.previewUrl ?? r.thumbUrl,
    zoomUrl: r.zoomUrl ?? null,
    focalX: r.focalX ?? null,
    focalY: r.focalY ?? null,
    caption: r.filename,
    badgeLabel: r.sessionName,
    metaBadges: r.persons.map((p) => p.name ?? p.icgId),
    width: r.originalWidth,
    height: r.originalHeight,
  };
}

export function MediaPickerSheet({ setId, open, onOpenChange, sessionLinks }: MediaPickerSheetProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<string>("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, cursor?: string, sessionId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("excludeSetId", setId);
      params.set("limit", "40");
      if (cursor) params.set("cursor", cursor);
      if (sessionId) params.set("sessionId", sessionId);

      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = (await res.json()) as { items: MediaSearchResult[]; nextCursor: string | null };
      setResults((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  // Debounce the search query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // (Re)load on open / query / session-filter change.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setSessionFilter("");
      setResults([]);
      setNextCursor(null);
      return;
    }
    doSearch(debouncedQuery, undefined, sessionFilter || undefined);
  }, [open, debouncedQuery, sessionFilter, doSearch]);

  const pickerItems = useMemo(() => results.map(toPickerItem), [results]);

  const handleConfirm = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const result = await addExistingMediaToSetAction(setId, ids);
    if (result.success) {
      toast.success(`Added ${ids.length} item${ids.length > 1 ? "s" : ""} to set`);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add media");
    }
  }, [setId, onOpenChange, router]);

  if (!open) return null;

  const toolbar = (
    <>
      <div className="relative w-56">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by filename…"
          className="w-full rounded-md border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
        />
      </div>
      {sessionLinks && sessionLinks.length > 0 && (
        <div className="relative">
          <Filter size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className={cn(
              "h-[30px] rounded-md border border-white/10 bg-white/5 pl-7 pr-3 text-xs text-white focus:outline-none",
              sessionFilter && "border-indigo-400/60",
            )}
          >
            <option value="">All sessions</option>
            {sessionLinks.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>{s.sessionName}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );

  return (
    <MediaPickerShell
      title="Browse & add media"
      items={pickerItems}
      loading={loading}
      hasMore={!!nextCursor}
      onLoadMore={() => { if (nextCursor) doSearch(debouncedQuery, nextCursor, sessionFilter || undefined); }}
      onClose={() => onOpenChange(false)}
      selectionMode="multi"
      onConfirm={handleConfirm}
      confirmLabel="Add to set"
      toolbar={toolbar}
    />
  );
}
