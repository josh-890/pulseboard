"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { createComparisonAction, addComparisonItemsAction } from "@/lib/actions/comparison-actions";
import { MediaPickerShell, type PickerItem } from "@/components/media/media-picker-shell";

type MediaSearchResult = {
  id: string;
  filename: string;
  originalWidth: number;
  originalHeight: number;
  thumbUrl: string;
  previewUrl?: string;
  zoomUrl?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  sessionName: string | null;
  persons: { id: string; icgId: string; name: string | null }[];
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

/**
 * Pick photos to build a comparison. Without `comparisonId` → creates a new
 * Comparison (≥2) and navigates to it; with `comparisonId` → adds the picked
 * photos to that existing comparison.
 */
export function ComparisonBuilderSheet({
  collectionId,
  comparisonId,
  open,
  onOpenChange,
  onCompleted,
}: {
  collectionId: string;
  comparisonId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("limit", "40");
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = (await res.json()) as { items: MediaSearchResult[]; nextCursor: string | null };
      setResults((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
      setNextCursor(null);
      return;
    }
    doSearch(debouncedQuery);
  }, [open, debouncedQuery, doSearch]);

  const pickerItems = useMemo(() => results.map(toPickerItem), [results]);

  const handleConfirm = useCallback(async (ids: string[]) => {
    if (comparisonId) {
      if (ids.length < 1) return;
      const result = await addComparisonItemsAction(comparisonId, ids, collectionId);
      if (result.success) {
        onOpenChange(false);
        onCompleted?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to add photos");
      }
      return;
    }
    if (ids.length < 2) {
      toast.error("Pick at least 2 photos to compare");
      return;
    }
    const result = await createComparisonAction(collectionId, ids);
    if (result.success && result.id) {
      onOpenChange(false);
      router.push(`/collections/${collectionId}/comparison/${result.id}`);
    } else {
      toast.error(result.error ?? "Failed to create comparison");
    }
  }, [collectionId, comparisonId, onOpenChange, onCompleted, router]);

  if (!open) return null;

  const toolbar = (
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
  );

  return (
    <MediaPickerShell
      title={comparisonId ? "Add photos to this comparison" : "Pick photos to compare (selection order = before → after)"}
      items={pickerItems}
      loading={loading}
      hasMore={!!nextCursor}
      onLoadMore={() => { if (nextCursor) doSearch(debouncedQuery, nextCursor); }}
      onClose={() => onOpenChange(false)}
      selectionMode="multi"
      onConfirm={handleConfirm}
      confirmLabel={comparisonId ? "Add photos" : "Create comparison"}
      toolbar={toolbar}
    />
  );
}
