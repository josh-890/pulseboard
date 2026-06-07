"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Loader2, Check, Columns2, Maximize2, ArrowLeft } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import { ZoomableImage } from "@/components/media/zoomable-image";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Normalized item shape every picker maps its native results into. */
export type PickerItem = {
  id: string;
  thumbUrl: string;
  previewUrl: string;
  zoomUrl?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  caption?: string | null;
  badgeLabel?: string | null;
  badgeHighlight?: boolean;
  /** Small chips shown top-right (e.g. person names in a set/collection picker). */
  metaBadges?: string[];
  width?: number | null;
  height?: number | null;
};

type MediaPickerShellProps = {
  title?: string;
  items: PickerItem[];
  loading?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onClose: () => void;
  selectionMode: "single" | "multi";
  /** Uncontrolled initial selection (multi). Ignored when `selectedIds` is supplied. */
  initialSelectedIds?: string[];
  /** Controlled selection (multi). When provided, the parent owns selection state. */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** single-select: fired with the chosen item. */
  onConfirmOne?: (item: PickerItem) => void;
  /** multi-select: fired with the chosen ids. */
  onConfirm?: (ids: string[]) => void;
  confirmLabel?: string;
  /** Override the confirm-button disabled state (default: disabled when nothing selected). */
  confirmDisabled?: boolean;
  toolbar?: React.ReactNode;
  /** Full-width row rendered below the header (e.g. session-filter chips). */
  filterBar?: React.ReactNode;
  uploadSlot?: React.ReactNode;
  footerExtras?: React.ReactNode;
};

// ─── Hook: viewport width ─────────────────────────────────────────────────────

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MediaPickerShell({
  title = "Select photo",
  items,
  loading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  onClose,
  selectionMode,
  initialSelectedIds = [],
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onConfirmOne,
  onConfirm,
  confirmLabel = "Add",
  confirmDisabled,
  toolbar,
  filterBar,
  uploadSlot,
  footerExtras,
}: MediaPickerShellProps) {
  const isWide = useIsWide();
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [internalSel, setInternalSel] = useState<Set<string>>(new Set(initialSelectedIds));
  const isControlled = controlledSelectedIds !== undefined;
  const selectedIds = useMemo(
    () => (isControlled ? new Set(controlledSelectedIds) : internalSel),
    [isControlled, controlledSelectedIds, internalSel],
  );
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const activeItem = activeId ? itemById.get(activeId) ?? null : null;
  const activeIndex = activeId ? items.findIndex((i) => i.id === activeId) : -1;

  // Default the active item to the first result (or when the active one drops out of
  // the list, e.g. after a filter change) — adjusted during render, not in an effect.
  if (items.length > 0 && (activeId === null || !itemById.has(activeId))) {
    setActiveId(items[0].id);
  }

  const selectActive = useCallback(
    (id: string) => {
      setActiveId(id);
      if (!isWide) setQuickLookOpen(true);
    },
    [isWide],
  );

  const toggleSelect = useCallback((id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (isControlled) onSelectionChange?.(Array.from(next));
    else setInternalSel(next);
  }, [selectedIds, isControlled, onSelectionChange]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // keep most-recent two
      return [...prev, id];
    });
  }, []);

  const confirmSingle = useCallback(
    (item: PickerItem) => {
      onConfirmOne?.(item);
    },
    [onConfirmOne],
  );

  const confirmMulti = useCallback(() => {
    onConfirm?.(Array.from(selectedIds));
  }, [onConfirm, selectedIds]);

  // ── Keyboard ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (compareOpen) setCompareOpen(false);
          else if (quickLookOpen) setQuickLookOpen(false);
          else onClose();
          break;
        case "ArrowLeft":
          if (activeIndex > 0) setActiveId(items[activeIndex - 1].id);
          break;
        case "ArrowRight":
          if (activeIndex >= 0 && activeIndex < items.length - 1) setActiveId(items[activeIndex + 1].id);
          break;
        case "Enter":
          if (!activeItem) break;
          e.preventDefault();
          if (selectionMode === "single") confirmSingle(activeItem);
          else toggleSelect(activeItem.id);
          break;
        case " ":
          if (activeItem) {
            e.preventDefault();
            toggleCompare(activeItem.id);
          }
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, activeItem, items, selectionMode, compareOpen, quickLookOpen, onClose, confirmSingle, toggleSelect, toggleCompare]);

  // ── Infinite scroll ──
  useEffect(() => {
    const el = loaderRef.current;
    if (!el || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) onLoadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  // Lock body scroll while open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const compareItems = compareIds.map((id) => itemById.get(id)).filter((i): i is PickerItem => !!i);

  if (typeof document === "undefined") return null;
  // Portal to <body> so the overlay isn't trapped by an ancestor's
  // backdrop-filter/transform containing block (e.g. the Slot Manager card).
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
          <X size={18} />
        </button>
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {selectionMode === "multi" && (
            <button
              onClick={confirmMulti}
              disabled={confirmDisabled ?? selectedIds.size === 0}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirmLabel}
              {selectedIds.size > 0 ? ` ${selectedIds.size}` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Filter bar (e.g. session chips) */}
      {filterBar && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/10 px-4 py-2 scrollbar-none">
          {filterBar}
        </div>
      )}

      {/* Body: split-pane */}
      <div className="flex min-h-0 flex-1">
        {/* Grid */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {error ? (
              <p className="text-center text-sm text-red-400">{error}</p>
            ) : items.length === 0 && !loading ? (
              <p className="text-center text-sm text-zinc-500">No photos found.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {items.map((item) => (
                  <Tile
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    selected={selectedIds.has(item.id)}
                    comparing={compareIds.includes(item.id)}
                    selectionMode={selectionMode}
                    onActivate={() => selectActive(item.id)}
                    onConfirm={() => (selectionMode === "single" ? confirmSingle(item) : toggleSelect(item.id))}
                    onToggleSelect={() => toggleSelect(item.id)}
                  />
                ))}
              </div>
            )}
            <div ref={loaderRef} className="flex justify-center py-4">
              {loading && <Loader2 size={18} className="animate-spin text-zinc-500" />}
            </div>
          </div>
          {(uploadSlot || footerExtras) && (
            <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
              {uploadSlot}
              {footerExtras}
            </div>
          )}
        </div>

        {/* Loupe (wide only) */}
        {isWide && (
          <div className="flex w-[45%] max-w-[680px] shrink-0 flex-col border-l border-white/10">
            {activeItem ? (
              <>
                <div className="relative min-h-0 flex-1 bg-black">
                  <ZoomableImage
                    fitUrl={activeItem.previewUrl}
                    zoomUrl={activeItem.zoomUrl}
                    width={activeItem.width}
                    height={activeItem.height}
                    alt={activeItem.caption ?? "Preview"}
                  />
                </div>
                <div className="shrink-0 border-t border-white/10 p-3">
                  {activeItem.caption && <p className="mb-2 truncate text-xs text-zinc-400">{activeItem.caption}</p>}
                  <div className="flex items-center gap-2">
                    {selectionMode === "single" ? (
                      <button
                        onClick={() => confirmSingle(activeItem)}
                        className="flex-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
                      >
                        Select this
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleSelect(activeItem.id)}
                        className={cn(
                          "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                          selectedIds.has(activeItem.id) ? "bg-indigo-500 text-white hover:bg-indigo-400" : "border border-white/15 text-white hover:bg-white/5",
                        )}
                      >
                        {selectedIds.has(activeItem.id) ? "Selected ✓" : "Select"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleCompare(activeItem.id)}
                      title="Add to compare"
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors",
                        compareIds.includes(activeItem.id) ? "border-indigo-400 text-indigo-300" : "border-white/15 text-zinc-300 hover:bg-white/5",
                      )}
                    >
                      <Columns2 size={15} /> Compare
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-zinc-500">Double-click the image to zoom · ←/→ to browse · Space to compare</p>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">Select a photo to preview</div>
            )}
          </div>
        )}
      </div>

      {/* Compare tray */}
      {compareItems.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-zinc-900/80 px-4 py-2">
          <span className="text-xs text-zinc-400">Compare:</span>
          {compareItems.map((it) => (
            <div key={it.id} className="relative h-12 w-12 overflow-hidden rounded">
              <Image src={it.thumbUrl} alt="" fill unoptimized className="object-cover" style={focalStyle(it.focalX, it.focalY)} sizes="48px" />
              <button onClick={() => toggleCompare(it.id)} aria-label="Remove" className="absolute right-0 top-0 bg-black/60 p-0.5 text-white">
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setCompareOpen(true)}
            disabled={compareItems.length < 2}
            className="ml-auto rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-40"
          >
            Compare side-by-side
          </button>
        </div>
      )}

      {/* Quick-Look overlay (narrow) */}
      {quickLookOpen && activeItem && !isWide && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-black">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
            <button onClick={() => setQuickLookOpen(false)} aria-label="Back" className="rounded-md p-1.5 text-zinc-300 hover:bg-white/5">
              <ArrowLeft size={18} />
            </button>
            <span className="truncate text-sm text-zinc-300">{activeItem.caption ?? ""}</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => toggleCompare(activeItem.id)} className="rounded-md border border-white/15 p-1.5 text-zinc-300" aria-label="Compare">
                <Columns2 size={16} />
              </button>
              <button
                onClick={() => {
                  if (selectionMode === "single") confirmSingle(activeItem);
                  else { toggleSelect(activeItem.id); setQuickLookOpen(false); }
                }}
                className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {selectionMode === "single" ? "Select" : selectedIds.has(activeItem.id) ? "Selected ✓" : "Select"}
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <ZoomableImage fitUrl={activeItem.previewUrl} zoomUrl={activeItem.zoomUrl} width={activeItem.width} height={activeItem.height} alt={activeItem.caption ?? "Preview"} />
          </div>
        </div>
      )}

      {/* Compare 2-up view */}
      {compareOpen && compareItems.length >= 2 && (
        <CompareView
          left={compareItems[0]}
          right={compareItems[1]}
          selectionMode={selectionMode}
          onClose={() => setCompareOpen(false)}
          onPickSingle={(it) => confirmSingle(it)}
          onToggleSelect={toggleSelect}
          selectedIds={selectedIds}
        />
      )}
    </div>,
    document.body,
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({
  item,
  active,
  selected,
  comparing,
  selectionMode,
  onActivate,
  onConfirm,
  onToggleSelect,
}: {
  item: PickerItem;
  active: boolean;
  selected: boolean;
  comparing: boolean;
  selectionMode: "single" | "multi";
  onActivate: () => void;
  onConfirm: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onDoubleClick={onConfirm}
      onKeyDown={(e) => { if (e.key === "Enter") onActivate(); }}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-zinc-900 ring-2 transition",
        active ? "ring-indigo-400" : selected ? "ring-indigo-500/60" : "ring-transparent hover:ring-white/30",
      )}
    >
      <Image src={item.thumbUrl} alt={item.caption ?? ""} fill unoptimized className="object-cover" style={focalStyle(item.focalX, item.focalY)} sizes="160px" />

      {selectionMode === "multi" && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          aria-label={selected ? "Deselect" : "Select"}
          className={cn(
            "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
            selected ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/60 bg-black/40 text-transparent hover:text-white/70",
          )}
        >
          <Check size={12} />
        </button>
      )}

      {comparing && (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-500/90 px-1 py-0.5 text-[9px] font-semibold text-white">CMP</span>
      )}

      {item.metaBadges && item.metaBadges.length > 0 && (
        <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-0.5">
          {item.metaBadges.slice(0, 2).map((m, i) => (
            <span key={i} className="max-w-[90%] truncate rounded bg-black/55 px-1 text-[9px] text-white/80 backdrop-blur-sm">{m}</span>
          ))}
        </div>
      )}

      {item.badgeLabel && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-4">
          <span className={cn("inline-block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-none", item.badgeHighlight ? "bg-indigo-500/80 text-white" : "bg-black/60 text-zinc-300")}>
            {item.badgeLabel}
          </span>
        </div>
      )}

      <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 p-0.5 text-white/0 transition group-hover:text-white/80">
        <Maximize2 size={12} />
      </span>
    </div>
  );
}

// ─── Compare 2-up ──────────────────────────────────────────────────────────────

function CompareView({
  left,
  right,
  selectionMode,
  onClose,
  onPickSingle,
  onToggleSelect,
  selectedIds,
}: {
  left: PickerItem;
  right: PickerItem;
  selectionMode: "single" | "multi";
  onClose: () => void;
  onPickSingle: (item: PickerItem) => void;
  onToggleSelect: (id: string) => void;
  selectedIds: Set<string>;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onClose} aria-label="Back" className="rounded-md p-1.5 text-zinc-300 hover:bg-white/5">
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-white">Compare</span>
        <span className="ml-auto text-[11px] text-zinc-500">Double-click either image to zoom</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {[left, right].map((it, idx) => (
          <div key={it.id} className={cn("flex min-h-0 flex-1 flex-col", idx === 0 && "border-b border-white/10 sm:border-b-0 sm:border-r")}>
            <div className="relative min-h-0 flex-1 bg-black">
              <ZoomableImage fitUrl={it.previewUrl} zoomUrl={it.zoomUrl} width={it.width} height={it.height} alt={it.caption ?? "Preview"} />
            </div>
            <div className="shrink-0 p-3">
              {selectionMode === "single" ? (
                <button onClick={() => onPickSingle(it)} className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400">
                  Select this
                </button>
              ) : (
                <button
                  onClick={() => onToggleSelect(it.id)}
                  className={cn("w-full rounded-md px-3 py-2 text-sm font-semibold transition-colors", selectedIds.has(it.id) ? "bg-indigo-500 text-white hover:bg-indigo-400" : "border border-white/15 text-white hover:bg-white/5")}
                >
                  {selectedIds.has(it.id) ? "Selected ✓" : "Select"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
