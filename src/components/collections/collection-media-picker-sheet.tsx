"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Plus, Check, ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addToCollectionAction } from "@/lib/actions/collection-actions";
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

// ─── Inline draggable panel (desktop, beside the collection gallery) ────────────
// Deliberately kept as a compact thumbnail panel with drag-to-add, so the collection
// stays visible as a drop target while browsing. The full-screen loupe experience is
// used by the Sheet (mobile) below.

type CollectionMediaPickerPanelProps = {
  collectionId: string;
  active: boolean;
  onClose: () => void;
  draggable?: boolean;
};

export function CollectionMediaPickerPanel({
  collectionId,
  active,
  onClose,
  draggable = false,
}: CollectionMediaPickerPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);
  const queryRef = useRef("");

  const doSearch = useCallback(async (q: string, cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("excludeCollectionId", collectionId);
      params.set("limit", "40");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = (await res.json()) as { items: MediaSearchResult[]; nextCursor: string | null };
      if (cursor) setResults((prev) => [...prev, ...data.items]);
      else setResults(data.items);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (!active) {
      setQuery("");
      setResults([]);
      setSelected(new Set());
      setNextCursor(null);
      return;
    }
    doSearch("");
  }, [active, doSearch]);

  const initialRef = useRef(true);
  useEffect(() => {
    if (!active) {
      initialRef.current = true;
      return;
    }
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, active, doSearch]);

  loadingRef.current = loading;
  nextCursorRef.current = nextCursor;
  queryRef.current = query;

  useEffect(() => {
    const container = scrollRef.current;
    if (!active || !container) return;
    function handleScroll() {
      if (loadingRef.current || !nextCursorRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container!;
      if (scrollTop + clientHeight >= scrollHeight - 200) doSearch(queryRef.current, nextCursorRef.current);
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [active, doSearch]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setAdding(true);
    const result = await addToCollectionAction(collectionId, Array.from(selected));
    setAdding(false);
    if (result.success) {
      toast.success(`Added ${selected.size} item${selected.size > 1 ? "s" : ""} to collection`);
      onClose();
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add media");
    }
  }

  function handleDragStart(e: React.DragEvent<HTMLButtonElement>, item: MediaSearchResult) {
    e.dataTransfer.setData("application/x-media-id", item.id);
    e.dataTransfer.effectAllowed = "copy";
    const img = e.currentTarget.querySelector("img");
    if (img) e.dataTransfer.setDragImage(img, 40, 40);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h3 className="text-sm font-semibold">Browse &amp; Add Media</h3>
          <p className="text-xs text-muted-foreground">
            {draggable ? "Drag items to collection or select & add" : "Select items to add"}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div className="relative pb-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by filename..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" autoFocus />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {results.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <ImageIcon size={32} />
            <p className="text-sm">No media items found</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {results.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleSelect(item.id)}
                draggable={draggable}
                onDragStart={draggable ? (e) => handleDragStart(e, item) : undefined}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-white/20",
                  draggable && "cursor-grab active:cursor-grabbing",
                )}
              >
                {item.thumbUrl ? (
                  <Image src={item.thumbUrl} alt={item.filename} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <ImageIcon size={24} className="text-muted-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-white/40 bg-black/30 opacity-0 group-hover:opacity-100",
                  )}
                >
                  {isSelected && <Check size={12} />}
                </div>
                {item.sessionName && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                    <p className="truncate text-[10px] text-white/80">{item.sessionName}</p>
                  </div>
                )}
                {item.persons.length > 0 && (
                  <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5">
                    {item.persons.slice(0, 2).map((p) => (
                      <span key={p.id} className="rounded bg-black/50 px-1 text-[9px] text-white/80 backdrop-blur-sm">{p.name ?? p.icgId}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-3">
        <div className="text-sm text-muted-foreground">
          {selected.size > 0 ? <span>{selected.size} item{selected.size > 1 ? "s" : ""} selected</span> : <span>Select items to add</span>}
        </div>
        <Button size="sm" disabled={selected.size === 0 || adding} onClick={handleAdd} className="gap-1">
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add to Collection
        </Button>
      </div>
    </div>
  );
}

// ─── Full-screen loupe sheet (mobile) ──────────────────────────────────────────

type CollectionMediaPickerSheetProps = {
  collectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function CollectionMediaPickerSheet({ collectionId, open, onOpenChange }: CollectionMediaPickerSheetProps) {
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
      params.set("excludeCollectionId", collectionId);
      params.set("limit", "40");
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = (await res.json()) as { items: MediaSearchResult[]; nextCursor: string | null };
      setResults((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

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
    if (ids.length === 0) return;
    const result = await addToCollectionAction(collectionId, ids);
    if (result.success) {
      toast.success(`Added ${ids.length} item${ids.length > 1 ? "s" : ""} to collection`);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add media");
    }
  }, [collectionId, onOpenChange, router]);

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
      title="Browse & add media"
      items={pickerItems}
      loading={loading}
      hasMore={!!nextCursor}
      onLoadMore={() => { if (nextCursor) doSearch(debouncedQuery, nextCursor); }}
      onClose={() => onOpenChange(false)}
      selectionMode="multi"
      onConfirm={handleConfirm}
      confirmLabel="Add to collection"
      toolbar={toolbar}
    />
  );
}
