"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setMediaFavoriteAction } from "@/lib/actions/media-actions";
import { addToCollectionAction } from "@/lib/actions/collection-actions";
import { CollectionQuickAddPalette } from "@/components/collections/collection-quick-add-palette";
import { DetailAssignSheet, type AssignPerson } from "@/components/people/detail-assign-sheet";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  FolderPlus,
  Heart,
  ImagePlus,
  Loader2,
  PanelRight,
  PanelRightClose,
  Pencil,
  Rows3,
  Columns2,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import { ZoomableImage } from "@/components/media/zoomable-image";
import { GalleryFilmstrip } from "./gallery-filmstrip";
import { GalleryInfoPanel } from "./gallery-info-panel";
import type { ReferenceContext, ProductionContext, CollectionContext } from "./gallery-info-panel";
import { useCompareTray } from "@/components/collections/compare-tray-provider";

export type { ReferenceContext, ProductionContext, ProductionContributor, CategoryWithGroup, CollectionContext } from "./gallery-info-panel";

type GalleryLightboxProps = {
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
  // Reverse "assign to detail category" (always-copy). Always available; the
  // context just seeds the person (current person / set contributors).
  detailAssignContext?: { defaultPerson?: AssignPerson | null; suggestedPeople?: AssignPerson[] };
  onFavoriteToggle?: (itemId: string) => void;
  onSetCover?: (mediaItemId: string | null) => void;
  coverMediaItemId?: string | null;
  onTagsChanged?: (itemId: string, newTags: string[]) => void;
  onUpdateTags?: (
    itemId: string,
    tags: string[],
  ) => Promise<{ success: boolean }>;
  // Person headshot context
  // Find similar
  onFindSimilar?: (mediaItemId: string) => void;
  // Focal point
  sessionId?: string;
  // Reference context (optional — forwarded to GalleryInfoPanel)
  referenceContext?: ReferenceContext;
  // Production context (optional — forwarded to GalleryInfoPanel for entity linking)
  productionContext?: ProductionContext;
  // Standalone collection context (optional — forwarded to GalleryInfoPanel)
  collectionContext?: CollectionContext;
  // When true and no collectionContext is supplied, the lightbox self-fetches the
  // collections list so "Add to collection" works anywhere (e.g. a person gallery).
  enableCollections?: boolean;
  // Delete handler — shows inline confirmation, then calls this
  onDelete?: (id: string) => void;
  // Edit handler — opens annotation editor for the current item
  onEdit?: (item: GalleryItem) => void;
  // Reference-session copy targets (production-set context). When provided,
  // a "Copy to reference" action appears in the toolbar + the C key triggers
  // it. Solo (1 target) fires immediately; multi opens a participant picker.
  // Empty / undefined → action hidden.
  copyToReferenceTargets?: ReferenceCopyTarget[];
  // Async copy handler — receives the chosen target + source mediaItem id.
  // Returns a structured result so the lightbox can show a precise toast.
  onCopyToReference?: (
    target: ReferenceCopyTarget,
    sourceMediaItemId: string,
  ) => Promise<{ ok: boolean; message: string; refSessionPersonId?: string }>;
};

export type ReferenceCopyTarget = {
  personId: string;
  name: string;
  // Null when the person has no reference session yet — UI surfaces the row
  // as disabled with an explanation, so the user understands why the copy
  // can't proceed instead of hitting an opaque error after clicking.
  referenceSessionId: string | null;
};

export function GalleryLightbox(props: GalleryLightboxProps) {
  return <SimpleLightbox {...props} />;
}

// ─── Simple mode (all contexts) ──────────────────────────────────────────────

function SimpleLightbox({
  items,
  initialIndex,
  onClose,
  detailAssignContext,
  onFavoriteToggle,
  onSetCover,
  coverMediaItemId,
  onTagsChanged,
  onUpdateTags,
  onFindSimilar,
  sessionId,
  referenceContext,
  productionContext,
  collectionContext,
  enableCollections,
  onDelete,
  onEdit,
  copyToReferenceTargets,
  onCopyToReference,
}: GalleryLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyInFlight, setCopyInFlight] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(referenceContext ? true : false);
  const [showFilmstrip, setShowFilmstrip] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Optimistically hide just-deleted items so the lightbox can advance to the next one
  // regardless of how/when the parent updates its `items` prop.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [focalOverlay, setFocalOverlay] = useState(false);
  const [localFocalPoints, setLocalFocalPoints] = useState<
    Map<string, { focalX: number | null; focalY: number | null }>
  >(new Map());
  // Local link overrides for optimistic updates from reference context
  const [localLinksMap, setLocalLinksMap] = useState<
    Map<string, GalleryItem["links"]>
  >(new Map());
  const [localCollectionIdsMap, setLocalCollectionIdsMap] = useState<
    Map<string, string[]>
  >(new Map());
  // ADR-0019: optimistic global-favorite override + self-handled toggle so the
  // heart works in every lightbox without per-page plumbing.
  const [localFavoriteMap, setLocalFavoriteMap] = useState<Map<string, boolean>>(new Map());
  const [, startFavTransition] = useTransition();
  // ADR-0019: quick-add palette + target collection.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [paletteCollections, setPaletteCollections] = useState<
    { id: string; name: string; isTarget?: boolean }[]
  >([]);
  const [, startCollTransition] = useTransition();
  const touchStartX = useRef<number | null>(null);
  // Zoom/pan is owned by <ZoomableImage>; we only track whether it's zoomed so
  // single-finger swipe-navigation is suppressed while the image is zoomed.
  const [imgZoomed, setImgZoomed] = useState(false);

  const localItems = useMemo(
    () =>
      items
        .filter((it) => !deletedIds.has(it.id))
        .map((it) => {
          const focalOverride = localFocalPoints.get(it.id);
          const linksOverride = localLinksMap.get(it.id);
          const collOverride = localCollectionIdsMap.get(it.id);
          const favOverride = localFavoriteMap.get(it.id);
          let result = it;
          if (focalOverride) result = { ...result, focalX: focalOverride.focalX, focalY: focalOverride.focalY };
          if (linksOverride !== undefined) result = { ...result, links: linksOverride };
          if (collOverride !== undefined) result = { ...result, collectionIds: collOverride };
          if (favOverride !== undefined) result = { ...result, isFavorite: favOverride };
          return result;
        }),
    [items, deletedIds, localFocalPoints, localLinksMap, localCollectionIdsMap, localFavoriteMap],
  );

  const item = localItems[currentIndex];

  // ADR-0019: toggle the global favorite. Optimistic local override + either the
  // parent's handler (keeps its own state in sync) or a self-handled persist.
  const handleFavorite = useCallback(
    (id: string) => {
      const cur = localItems.find((p) => p.id === id);
      const next = !(cur?.isFavorite ?? false);
      setLocalFavoriteMap((m) => new Map(m).set(id, next));
      if (onFavoriteToggle) {
        onFavoriteToggle(id);
      } else {
        startFavTransition(async () => {
          await setMediaFavoriteAction(id, next);
        });
      }
    },
    [localItems, onFavoriteToggle],
  );

  // ADR-0019: quick-add palette data + optimistic collection membership.
  useEffect(() => {
    fetch("/api/collections/palette")
      .then((r) => r.json())
      .then((data: { id: string; name: string; isTarget?: boolean }[]) => setPaletteCollections(data))
      .catch(() => {});
  }, []);

  const handlePaletteMembership = useCallback(
    (collectionId: string, isIn: boolean) => {
      if (!item) return;
      const cur = item.collectionIds ?? [];
      const next = isIn ? [...cur, collectionId] : cur.filter((c) => c !== collectionId);
      setLocalCollectionIdsMap((m) => new Map(m).set(item.id, next));
    },
    [item],
  );

  const addToTarget = useCallback(() => {
    if (!item) return;
    const target = paletteCollections.find((c) => c.isTarget);
    if (!target) {
      toast.message("No target collection set — set one with the ★ on a collection.");
      return;
    }
    if ((item.collectionIds ?? []).includes(target.id)) {
      toast.message(`Already in ${target.name}`);
      return;
    }
    setLocalCollectionIdsMap((m) => new Map(m).set(item.id, [...(item.collectionIds ?? []), target.id]));
    startCollTransition(async () => {
      const res = await addToCollectionAction(target.id, [item.id]);
      if (res.success) toast.success(`Added to ${target.name}`);
      else toast.error(res.error ?? "Failed");
    });
  }, [item, paletteCollections]);

  // ── Copy to reference session ──
  // The lightbox owns the picker state + dispatch so the parent doesn't have
  // to thread a popover across the lightbox boundary. Behaviour:
  //   0 targets  → action hidden
  //   1 target   → C key / button fires the copy directly
  //   N targets  → C key / button opens a chooser popover
  const canCopyToReference = !!onCopyToReference && !!copyToReferenceTargets && copyToReferenceTargets.length > 0;
  const handleCopyToReferenceTarget = useCallback(
    async (target: ReferenceCopyTarget) => {
      if (!onCopyToReference || !item) return;
      if (target.referenceSessionId == null) {
        toast.error(`${target.name} has no reference session yet`);
        return;
      }
      setCopyInFlight(true);
      try {
        const result = await onCopyToReference(target, item.id);
        if (result.ok) {
          toast.success(result.message, {
            action: result.refSessionPersonId
              ? {
                  label: "Open",
                  onClick: () => {
                    window.location.href = `/people/${result.refSessionPersonId}`;
                  },
                }
              : undefined,
          });
        } else {
          toast.error(result.message);
        }
      } finally {
        setCopyInFlight(false);
        setCopyPickerOpen(false);
      }
    },
    [onCopyToReference, item],
  );

  const handleCopyTrigger = useCallback(() => {
    if (!canCopyToReference || !copyToReferenceTargets) return;
    if (copyToReferenceTargets.length === 1) {
      void handleCopyToReferenceTarget(copyToReferenceTargets[0]);
    } else {
      setCopyPickerOpen((p) => !p);
    }
  }, [canCopyToReference, copyToReferenceTargets, handleCopyToReferenceTarget]);

  const handleFocalPointChange = useCallback(
    (itemId: string, focalX: number | null, focalY: number | null) => {
      setLocalFocalPoints((prev) => {
        const next = new Map(prev);
        next.set(itemId, { focalX, focalY });
        return next;
      });
    },
    [],
  );

  // Build referenceContext with local-state-aware callbacks
  const augmentedReferenceContext = useMemo(() => {
    if (!referenceContext) return undefined;
    return {
      ...referenceContext,
      onLinksChange: (itemId: string, links: NonNullable<GalleryItem["links"]>) => {
        setLocalLinksMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, links);
          return next;
        });
        referenceContext.onLinksChange?.(itemId, links);
      },
      onCollectionIdsChange: (itemId: string, collIds: string[]) => {
        setLocalCollectionIdsMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, collIds);
          return next;
        });
        referenceContext.onCollectionIdsChange?.(itemId, collIds);
      },
    };
  }, [referenceContext]);

  // Self-fetched collections list when enableCollections is set (no explicit context).
  const tray = useCompareTray();
  const [fetchedCollections, setFetchedCollections] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!enableCollections || collectionContext) return;
    let cancelled = false;
    fetch("/api/collections/list")
      .then((r) => r.json())
      // Plain toggles only make sense for GRID collections; SIDE_BY_SIDE membership
      // goes through the Compare tray (a photo belongs to a comparison, not the
      // collection directly).
      .then((data: { id: string; name: string; layout?: string }[]) => {
        if (!cancelled) setFetchedCollections(data.filter((c) => c.layout !== "SIDE_BY_SIDE").map(({ id, name }) => ({ id, name })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enableCollections, collectionContext]);

  // Build standalone collectionContext with local-state-aware callback. Falls back
  // to the self-fetched list so add-to-collection works in any lightbox.
  const augmentedCollectionContext = useMemo(() => {
    const base = collectionContext ?? (fetchedCollections.length > 0 ? { collections: fetchedCollections } : undefined);
    if (!base) return undefined;
    return {
      ...base,
      onCollectionIdsChange: (itemId: string, collIds: string[]) => {
        setLocalCollectionIdsMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, collIds);
          return next;
        });
        base.onCollectionIdsChange?.(itemId, collIds);
      },
    };
  }, [collectionContext, fetchedCollections]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNavigate = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const hasFocalPointSupport = !!(sessionId || referenceContext?.sessionId);

  const handleToggleInfoPanel = useCallback(() => {
    setShowInfoPanel((prev) => {
      if (prev) {
        // Closing the panel — reset focal overlay
        setFocalOverlay(false);
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
          break;
        case "ArrowLeft":
          e.stopImmediatePropagation();
          goPrev();
          break;
        case "ArrowRight":
          e.stopImmediatePropagation();
          goNext();
          break;
        case "i":
        case "I":
          handleToggleInfoPanel();
          break;
        case "t":
        case "T":
          setShowFilmstrip((p) => !p);
          break;
        case "f":
        case "F":
          if (hasFocalPointSupport) setFocalOverlay((p) => !p);
          break;
        case "c":
        case "C":
          if (canCopyToReference) {
            e.preventDefault();
            handleCopyTrigger();
          }
          break;
        case ".":
          // ADR-0019: toggle global favorite on the current image.
          if (item) {
            e.preventDefault();
            handleFavorite(item.id);
          }
          break;
        case "b":
        case "B":
          // ADR-0019: open the collection quick-add palette.
          if (item) {
            e.preventDefault();
            setPaletteOpen(true);
          }
          break;
        case "g":
        case "G":
          // ADR-0019: one-key add to the target collection.
          if (item) {
            e.preventDefault();
            addToTarget();
          }
          break;
        case "d":
        case "D":
          // Reverse "assign to detail category".
          if (item) {
            e.preventDefault();
            setAssignOpen(true);
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev, handleToggleInfoPanel, hasFocalPointSupport, canCopyToReference, handleCopyTrigger, handleFavorite, addToTarget, item]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Single-finger swipe navigation (zoom/pan is handled inside <ZoomableImage>).
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (imgZoomed) return; // image is zoomed — let pan own the gesture
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  }

  if (!item) return null;

  const displayUrl =
    item.urls.full_2400 ?? item.urls.gallery_1600 ?? item.urls.gallery_1024 ?? item.urls.original;

  const infoPanelProps = {
    item,
    onSetCover,
    coverMediaItemId,
    onFavoriteToggle: handleFavorite,
    onUpdateTags,
    onTagsChanged,
    onFindSimilar,
    sessionId,
    onFocalPointChange: handleFocalPointChange,
    onFocalOverlayToggle: () => setFocalOverlay((p) => !p),
    focalOverlayActive: focalOverlay,
    referenceContext: augmentedReferenceContext,
    productionContext,
    collectionContext: augmentedCollectionContext,
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media lightbox"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 outline-none"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-white/5">
        <span className="text-sm text-white/70">
          {currentIndex + 1} / {localItems.length}
        </span>
        <span className="hidden sm:block truncate max-w-[40%] text-xs text-white/50">
          {item.filename}
        </span>
        <div className="flex items-center gap-1.5">
          {hasFocalPointSupport && (
            <button
              type="button"
              onClick={() => setFocalOverlay((p) => !p)}
              className={cn(
                "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                focalOverlay
                  ? "bg-amber-500/30 text-amber-400 ring-1 ring-amber-500/40"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
              aria-label={focalOverlay ? "Hide focal point overlay" : "Show focal point overlay"}
              aria-pressed={focalOverlay}
              title="Focal point overlay (F)"
            >
              <Crosshair size={16} />
            </button>
          )}
          {localItems.length > 1 && (
            <button
              type="button"
              onClick={() => setShowFilmstrip((p) => !p)}
              className={cn(
                "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                showFilmstrip
                  ? "bg-white/20 text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
              aria-label={showFilmstrip ? "Hide filmstrip" : "Show filmstrip"}
              title="Filmstrip (T)"
            >
              <Rows3 size={16} />
            </button>
          )}
          {item && (
            <button
              type="button"
              onClick={() => handleFavorite(item.id)}
              className={cn(
                "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                item.isFavorite ? "bg-red-500/90 text-white" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
              aria-label={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
              title="Favorite (.)"
            >
              <Heart size={16} fill={item.isFavorite ? "currentColor" : "none"} />
            </button>
          )}
          {item && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="rounded-full p-2 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Add to collection"
              title="Add to collection (B)"
            >
              <FolderPlus size={16} />
            </button>
          )}
          {item && (
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="rounded-full p-2 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Assign to detail category"
              title="Assign to a person's detail category (D)"
            >
              <ImagePlus size={16} />
            </button>
          )}
          {item && (
            <button
              type="button"
              onClick={() => {
                if (tray.has(item.id)) tray.remove(item.id);
                else tray.add({ mediaItemId: item.id, thumbUrl: item.urls.gallery_512 ?? item.urls.view_1200 ?? item.urls.original ?? null });
              }}
              className={cn(
                "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                tray.has(item.id) ? "bg-amber-400 text-black" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
              aria-label={tray.has(item.id) ? "Remove from compare tray" : "Add to compare tray"}
              title="Add to compare tray"
            >
              <Columns2 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleInfoPanel}
            className={cn(
              "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              showInfoPanel
                ? "bg-white/20 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
            )}
            aria-label={showInfoPanel ? "Hide info panel" : "Show info panel"}
            title="Info panel (I)"
          >
            {showInfoPanel ? (
              <PanelRightClose size={16} />
            ) : (
              <PanelRight size={16} />
            )}
          </button>
          {canCopyToReference && (
            <div className="relative">
              <button
                type="button"
                onClick={handleCopyTrigger}
                disabled={copyInFlight}
                className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-emerald-500/30 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50"
                aria-label="Copy to reference session"
                title="Copy to reference session (C)"
              >
                {copyInFlight ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
              </button>
              {copyPickerOpen && copyToReferenceTargets && copyToReferenceTargets.length > 1 && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-white/15 bg-zinc-900/95 shadow-lg backdrop-blur-sm"
                  role="menu"
                >
                  <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
                    Copy to reference of…
                  </div>
                  {copyToReferenceTargets.map((t) => {
                    const disabled = t.referenceSessionId == null;
                    return (
                      <button
                        key={t.personId}
                        type="button"
                        role="menuitem"
                        disabled={disabled || copyInFlight}
                        onClick={() => handleCopyToReferenceTarget(t)}
                        className={cn(
                          "block w-full px-3 py-2 text-left text-sm transition-colors",
                          disabled
                            ? "cursor-not-allowed text-white/30"
                            : "text-white/85 hover:bg-emerald-500/20 hover:text-emerald-200",
                        )}
                        title={disabled ? "No reference session yet" : undefined}
                      >
                        <div>{t.name}</div>
                        {disabled && (
                          <div className="text-[10px] text-white/40">
                            no reference session
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-amber-500/30 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Edit this photo"
              title="Edit"
            >
              <Pencil size={16} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-destructive/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Delete this item"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-w-0">
          {/* Image area with nav */}
          <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6 min-h-0 overflow-hidden">
            {localItems.length > 1 && (
              <>
                {currentIndex > 0 && (
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous"
                    className="absolute left-2 sm:left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                {currentIndex < localItems.length - 1 && (
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next"
                    className="absolute right-2 sm:right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </>
            )}

            <ZoomableImage
              fitUrl={displayUrl}
              zoomUrl={item.urls.master_4000}
              width={item.originalWidth}
              height={item.originalHeight}
              alt={item.caption ?? `Photo ${currentIndex + 1}`}
              focalX={item.focalX}
              focalY={item.focalY}
              showFocalOverlay={focalOverlay}
              onZoomChange={setImgZoomed}
            />
          </div>

          {/* Filmstrip */}
          {showFilmstrip && localItems.length > 1 && (
            <GalleryFilmstrip
              items={localItems}
              activeIndex={currentIndex}
              onNavigate={handleNavigate}
            />
          )}
        </div>

        {/* Right: info panel (desktop) */}
        {showInfoPanel && (
          <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-white/10 bg-black/60 backdrop-blur-md overflow-y-auto">
            <GalleryInfoPanel {...infoPanelProps} />
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet info panel */}
      {showInfoPanel && (
        <div className="lg:hidden border-t border-white/10 bg-black/80 backdrop-blur-sm max-h-[35vh] overflow-y-auto">
          <GalleryInfoPanel {...infoPanelProps} />
        </div>
      )}

      {/* Delete confirmation (Radix portals itself to body) */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the file and all associated metadata. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteConfirmOpen(false);
                const deletedId = item.id;
                // Was this the last image in the row? (last index, or the only one left)
                const wasLast = currentIndex >= localItems.length - 1;
                onDelete?.(deletedId);
                // Optimistically drop it: localItems shrinks by one. If it wasn't the last,
                // currentIndex now points at what was the *next* image; if it was the last
                // (or only) one, fall back to the gallery.
                setDeletedIds((prev) => new Set(prev).add(deletedId));
                if (localItems.length <= 1 || wasLast) {
                  onClose();
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ADR-0019: collection quick-add palette (hotkey b / toolbar) */}
      <CollectionQuickAddPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        mediaItemId={item?.id ?? null}
        collectionIds={item?.collectionIds ?? []}
        collections={paletteCollections}
        onMembershipChange={handlePaletteMembership}
      />

      {/* Reverse assign-to-detail (hotkey d / toolbar) — mount only when open */}
      {assignOpen && item && (
        <DetailAssignSheet
          open
          onOpenChange={setAssignOpen}
          mediaItemId={item.id}
          mediaItemUrl={item.urls.original ?? item.urls.full_2400 ?? item.urls.view_1200 ?? displayUrl}
          defaultPerson={detailAssignContext?.defaultPerson ?? null}
          suggestedPeople={detailAssignContext?.suggestedPeople ?? []}
        />
      )}
    </div>,
    document.body,
  );
}
