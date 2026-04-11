"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Plus, Check, ImageIcon, Loader2, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { addExistingMediaToSetAction } from "@/lib/actions/set-actions";

type MediaSearchResult = {
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  thumbUrl: string;
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

export function MediaPickerSheet({ setId, open, onOpenChange, sessionLinks }: MediaPickerSheetProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<string>("");
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
  const sessionFilterRef = useRef("");

  const doSearch = useCallback(async (q: string, cursor?: string, sessionId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("excludeSetId", setId);
      params.set("limit", "40");
      if (cursor) params.set("cursor", cursor);
      const sid = sessionId ?? sessionFilterRef.current;
      if (sid) params.set("sessionId", sid);

      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = await res.json() as {
        items: MediaSearchResult[];
        nextCursor: string | null;
      };

      if (cursor) {
        setResults((prev) => [...prev, ...data.items]);
      } else {
        setResults(data.items);
      }
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSessionFilter("");
      sessionFilterRef.current = "";
      setResults([]);
      setSelected(new Set());
      setNextCursor(null);
      return;
    }
    // Load initial results when opening
    doSearch("");
  }, [open, doSearch]);

  const initialRef = useRef(true);
  useEffect(() => {
    if (!open) {
      initialRef.current = true;
      return;
    }
    // Skip on initial mount — the open effect already fires doSearch("")
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, doSearch]);

  // Re-search when session filter changes
  useEffect(() => {
    if (!open) return;
    sessionFilterRef.current = sessionFilter;
    doSearch(query, undefined, sessionFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFilter]);

  // Keep refs in sync for scroll handler
  loadingRef.current = loading;
  nextCursorRef.current = nextCursor;
  queryRef.current = query;

  // Infinite scroll via scroll event
  useEffect(() => {
    const container = scrollRef.current;
    if (!open || !container) return;

    function handleScroll() {
      if (loadingRef.current || !nextCursorRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container!;
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        doSearch(queryRef.current, nextCursorRef.current);
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [open, doSearch]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setAdding(true);
    const result = await addExistingMediaToSetAction(setId, Array.from(selected));
    setAdding(false);

    if (result.success) {
      toast.success(`Added ${selected.size} item${selected.size > 1 ? "s" : ""} to set`);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add media");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Browse & Add Media</SheetTitle>
          <SheetDescription>
            Select existing media items to add to this set. Source sessions will auto-link.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0 pt-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search by filename..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {sessionLinks && sessionLinks.length > 0 && (
              <div className="relative">
                <Filter
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <select
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  className={cn(
                    "h-9 rounded-md border border-input bg-background pl-7 pr-3 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    sessionFilter && "border-primary/60 bg-primary/5 text-primary",
                  )}
                >
                  <option value="">All sessions</option>
                  {sessionLinks.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.sessionName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Results grid */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
            {results.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <ImageIcon size={32} />
                <p className="text-sm">No media items found</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {results.map((item) => {
                const isSelected = selected.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSelect(item.id)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-white/20",
                    )}
                  >
                    {item.thumbUrl ? (
                      <Image
                        src={item.thumbUrl}
                        alt={item.filename}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <ImageIcon size={24} className="text-muted-foreground" />
                      </div>
                    )}

                    {/* Selection check */}
                    <div
                      className={cn(
                        "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-white/40 bg-black/30 opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {isSelected && <Check size={12} />}
                    </div>

                    {/* Session overlay */}
                    {item.sessionName && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                        <p className="truncate text-[10px] text-white/80">
                          {item.sessionName}
                        </p>
                      </div>
                    )}

                    {/* Person badges */}
                    {item.persons.length > 0 && (
                      <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5">
                        {item.persons.slice(0, 2).map((p) => (
                          <span
                            key={p.id}
                            className="rounded bg-black/50 px-1 text-[9px] text-white/80 backdrop-blur-sm"
                          >
                            {p.name ?? p.icgId}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {loading && results.length > 0 && (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {loading && results.length === 0 && (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className="text-sm text-muted-foreground">
              {selected.size > 0 ? (
                <span>
                  {selected.size} item{selected.size > 1 ? "s" : ""} selected
                </span>
              ) : (
                <span>Select items to add</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={selected.size === 0 || adding}
                onClick={handleAdd}
                className="gap-1"
              >
                {adding ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Add to Set
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
