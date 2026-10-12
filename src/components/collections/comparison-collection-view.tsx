"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Columns2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComparisonBuilderSheet } from "@/components/collections/comparison-builder-sheet";
import { ComparisonComposite, comparisonShape } from "@/components/collections/comparison-composite";
import { ComparisonLightbox } from "@/components/collections/comparison-lightbox";
import { computeRows, GALLERY_GAP, MOBILE_TARGET, TARGET_ROW_HEIGHT } from "@/lib/gallery-layout";
import type { ComparisonSummary } from "@/lib/services/comparison-service";

type SortKey = "manual" | "title" | "count-desc" | "count-asc";

// A comparison collection (ADR-0015): its comparisons as they were composed, laid
// out like a Grid collection's photos (justified rows). A click opens the viewer
// (?c=<id>; &edit=1 = compose mode) — the URL holds it, so Back closes it and a
// link opens it. Opening pushes a history entry; moving within the viewer
// replaces it. The history API is used directly so nothing is refetched.

const noopSubscribe = () => () => {};

function setViewerUrl(params: { c: string | null; edit: boolean }, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  if (params.c) url.searchParams.set("c", params.c);
  else url.searchParams.delete("c");
  if (params.c && params.edit) url.searchParams.set("edit", "1");
  else url.searchParams.delete("edit");
  const next = `${url.pathname}${url.search}`;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

export function ComparisonCollectionView({
  collectionId,
  comparisons,
}: {
  collectionId: string;
  comparisons: ComparisonSummary[];
}) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("manual");
  const searchParams = useSearchParams();
  const openId = searchParams.get("c");
  const editing = searchParams.get("edit") === "1";
  // The viewer is a portal — client only
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // Whether this page opened the viewer (then closing goes Back, so Back and
  // close agree); a viewer opened by a link closes by replacing the URL
  const pushedRef = useRef(false);
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A callback ref: the grid mounts only once there is something to show
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    if (!gridEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setGridWidth(entry.contentRect.width);
    });
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [gridEl]);

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = comparisons.filter((c) => !q || (c.title ?? "").toLowerCase().includes(q));
    switch (sort) {
      case "title":
        return [...list].sort((a, b) => (a.title ?? "￿").localeCompare(b.title ?? "￿"));
      case "count-desc":
        return [...list].sort((a, b) => b.memberCount - a.memberCount);
      case "count-asc":
        return [...list].sort((a, b) => a.memberCount - b.memberCount);
      default:
        return list; // manual = the stored sortOrder
    }
  }, [comparisons, query, sort]);

  // A comparison measures like a photo: N cells of the aspect-driver's shape
  const rows = useMemo(() => {
    const measured = displayed.map((c) => {
      const { cellW, cellH } = comparisonShape(c.members);
      return { comparison: c, originalWidth: cellW * Math.max(1, c.members.length), originalHeight: cellH };
    });
    return computeRows(measured, gridWidth, gridWidth < 640 ? MOBILE_TARGET : TARGET_ROW_HEIGHT);
  }, [displayed, gridWidth]);

  // The viewer walks the grid's order; a comparison hidden by the filter still opens
  const viewerList = openId && displayed.some((c) => c.id === openId) ? displayed : comparisons;

  const open = useCallback((id: string) => {
    pushedRef.current = true;
    setViewerUrl({ c: id, edit: false }, "push");
  }, []);
  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      setViewerUrl({ c: null, edit: false }, "replace");
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {comparisons.length} comparison{comparisons.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setBuilderOpen(true)}>
          <Plus size={14} /> New comparison
        </Button>
      </div>

      {comparisons.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title…"
              className="w-full rounded-lg border border-white/15 bg-background/60 py-1.5 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-white/15 bg-background/60 px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Sort comparisons"
          >
            <option value="manual">Manual order</option>
            <option value="title">Title A–Z</option>
            <option value="count-desc">Most photos</option>
            <option value="count-asc">Fewest photos</option>
          </select>
        </div>
      )}

      {comparisons.length === 0 ? (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
          <Columns2 size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            No comparisons yet. Create one from two or more photos.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBuilderOpen(true)}>
            <Plus size={14} /> New comparison
          </Button>
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No comparisons match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div ref={setGridEl} className="w-full">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex" style={{ gap: GALLERY_GAP, marginBottom: GALLERY_GAP }}>
              {row.items.map(({ comparison: c, originalWidth, originalHeight }) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => open(c.id)}
                  title={c.title ?? undefined}
                  aria-label={`Open comparison ${c.title ?? ""} (${c.memberCount} photos)`}
                  className="group relative shrink-0 overflow-hidden rounded-lg outline-none ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ width: row.height * (originalWidth / originalHeight), height: row.height }}
                >
                  <ComparisonComposite members={c.members} fitMode={c.fitMode} source="thumb" className="h-full w-full" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-left text-xs text-white opacity-90">
                    <span className="truncate font-medium">{c.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px]">
                      <Columns2 size={10} /> {c.memberCount}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {mounted && openId && comparisons.some((c) => c.id === openId) && (
        <ComparisonLightbox
          comparisons={viewerList}
          openId={openId}
          editing={editing}
          collectionId={collectionId}
          onNavigate={(id) => setViewerUrl({ c: id, edit: false }, "replace")}
          onEditChange={(edit) => setViewerUrl({ c: openId, edit }, "replace")}
          onClose={close}
        />
      )}

      <ComparisonBuilderSheet collectionId={collectionId} open={builderOpen} onOpenChange={setBuilderOpen} />
    </div>
  );
}
