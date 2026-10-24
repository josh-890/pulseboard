"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clearMediaDecodeIssueAction,
  setMediaFavoriteAction,
  setMediaShownPeopleAction,
  setMediaShownSupportAction,
} from "@/lib/actions/media-actions";
import { addToCollectionAction } from "@/lib/actions/collection-actions";
import { CollectionQuickAddPalette } from "@/components/collections/collection-quick-add-palette";
import { TagPalette } from "@/components/tags";
import { useEntityTags } from "@/hooks/use-entity-tags";
import { useArmedTag } from "@/hooks/use-armed-tag";
import { useTagSlots } from "@/hooks/use-tag-slots";
import { useMarkTags } from "@/hooks/use-mark-tags";
import { MARK_BY_KEY, markCascade, type MarkKey } from "./media-marks";
import type { PaletteTag } from "@/lib/services/tag-service";
import { tagFitsEntity } from "@/lib/tag-domains";
import { DetailAssignSheet, type AssignPerson } from "@/components/people/detail-assign-sheet";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
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
import type { GalleryCastMember } from "@/lib/types/gallery";
import { ZoomableImage } from "@/components/media/zoomable-image";
import { GalleryFilmstrip } from "./gallery-filmstrip";
import { LightboxToolbar } from "./lightbox-toolbar";
import { LightboxShortcutsSheet } from "./lightbox-shortcuts-sheet";
import type { EvidenceAct } from "@/components/intensity/act-evidence-list";
import { GalleryInfoPanel } from "./gallery-info-panel";
import { useMediaOrigin } from "./use-media-origin";
import { mediaOriginTarget } from "@/lib/media-origin-href";
import type { ReferenceContext, ProductionContext, CollectionContext } from "./gallery-info-panel";
import { useCompareTray } from "@/components/collections/compare-tray-provider";

export type { ReferenceContext, ProductionContext, ProductionContributor, CategoryWithGroup, CollectionContext } from "./gallery-info-panel";

type GalleryLightboxProps = {
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
  // Reverse "assign to detail category" (always-copy). Always available.
  // `defaultPerson` seeds the current person; `restrictTo` constrains the picker
  // to a set's participants (sessions fall back to productionContext.contributors).
  detailAssignContext?: { defaultPerson?: AssignPerson | null; restrictTo?: AssignPerson[] };
  onFavoriteToggle?: (itemId: string) => void;
  onSetCover?: (mediaItemId: string | null) => void;
  coverMediaItemId?: string | null;
  // Person headshot context
  // Find similar
  onFindSimilar?: (mediaItemId: string) => void;
  // Focal point
  sessionId?: string;
  // Reference context (optional — forwarded to GalleryInfoPanel)
  referenceContext?: ReferenceContext;
  // Production context (optional — forwarded to GalleryInfoPanel for entity linking)
  productionContext?: ProductionContext;
  // Per-image "people shown" cast directory (ADR-0023). When provided, the info
  // panel shows a "People shown" chip section (default all-shown, deselect absent).
  cast?: GalleryCastMember[];
  // Notifies the parent gallery when an image's hidden set changes, so the grid's
  // subset badge updates live (without a reload).
  onHiddenPersonsChange?: (itemId: string, hiddenPersonIds: string[]) => void;
  /** Support shown on an image changed (2026-10-24) */
  onShownSupportChange?: (itemId: string, shownSupportIds: string[]) => void;
  /** "Looks fine" cleared a damaged image's flag — lets the parent drop its red frame */
  onDecodeIssueCleared?: (itemId: string) => void;
  // Standalone collection context (optional — forwarded to GalleryInfoPanel)
  collectionContext?: CollectionContext;
  // When true and no collectionContext is supplied, the lightbox self-fetches the
  // collections list so "Add to collection" works anywhere (e.g. a person gallery).
  enableCollections?: boolean;
  // Galleries gathered from everywhere (favorites, collections, tags): show where
  // each photo comes from — a "back to its set" link in the bar (key O) and an
  // Origin section in the info panel.
  showOrigin?: boolean;
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
  /** ADR-0036, 3b: a session gallery with intensity — the photo as evidence for ticked acts (A) */
  actEvidence?: {
    acts: EvidenceAct[];
    linkedOf: (mediaItemId: string) => string[];
    onToggle: (contributionActId: string, mediaItemId: string, linked: boolean) => void;
  };
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
  onFindSimilar,
  sessionId,
  referenceContext,
  productionContext,
  collectionContext,
  cast,
  actEvidence,
  onHiddenPersonsChange,
  onShownSupportChange,
  onDecodeIssueCleared,
  enableCollections,
  showOrigin = false,
  onDelete,
  onEdit,
  copyToReferenceTargets,
  onCopyToReference,
}: GalleryLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const router = useRouter();
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyInFlight, setCopyInFlight] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(referenceContext ? true : false);
  const [showFilmstrip, setShowFilmstrip] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // The `?` cheat sheet and the toolbar's own menus take the keyboard while open
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState<"more" | "slots" | "acts" | null>(null);
  // Del opens the confirmation with "Delete permanently" focused, so Enter confirms
  const deleteActionRef = useRef<HTMLButtonElement>(null);
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
  // Damaged-file flags cleared here ("Looks fine") — optimistic until the parent reloads
  const [decodeClearedIds, setDecodeClearedIds] = useState<Set<string>>(new Set());
  const [isDecodeClearPending, startDecodeClearTransition] = useTransition();
  // ADR-0023: optimistic per-image "people shown" override (hidden person ids).
  const [localHiddenMap, setLocalHiddenMap] = useState<Map<string, string[]>>(new Map());
  const [localShownSupportMap, setLocalShownSupportMap] = useState<Map<string, string[]>>(new Map());
  const [, startHiddenTransition] = useTransition();
  // ADR-0019: quick-add palette + target collection.
  const [paletteOpen, setPaletteOpen] = useState(false);
  // ADR-0033: tag palette (`T`) for the current image.
  const [tagPaletteOpen, setTagPaletteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [paletteCollections, setPaletteCollections] = useState<
    { id: string; name: string; isTarget?: boolean }[]
  >([]);
  // Collections created in-session from the lightbox (ADR-0019 create-on-the-fly).
  // Merged into both the palette + info-panel lists so a just-made collection is
  // immediately present + toggleable regardless of where its list came from.
  const [createdCollections, setCreatedCollections] = useState<{ id: string; name: string }[]>([]);
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
          const hiddenOverride = localHiddenMap.get(it.id);
          const shownSupportOverride = localShownSupportMap.get(it.id);
          let result = it;
          if (focalOverride) result = { ...result, focalX: focalOverride.focalX, focalY: focalOverride.focalY };
          if (linksOverride !== undefined) result = { ...result, links: linksOverride };
          if (collOverride !== undefined) result = { ...result, collectionIds: collOverride };
          if (favOverride !== undefined) result = { ...result, isFavorite: favOverride };
          if (hiddenOverride !== undefined) result = { ...result, hiddenPersonIds: hiddenOverride };
          if (shownSupportOverride !== undefined) result = { ...result, shownSupportIds: shownSupportOverride };
          if (decodeClearedIds.has(it.id)) result = { ...result, decodeIssue: null };
          return result;
        }),
    [items, deletedIds, localFocalPoints, localLinksMap, localCollectionIdsMap, localFavoriteMap, localHiddenMap, localShownSupportMap, decodeClearedIds],
  );

  const item = localItems[currentIndex];
  const origin = useMediaOrigin(item?.id, showOrigin);
  // One controller for the current image's tags: the info panel lists them,
  // the `T` palette edits them — both see the same optimistic state.
  const tagController = useEntityTags("MEDIA_ITEM", item?.id ?? null);
  // S3: quick-tag slots (1–9) and the armed tag (Shift+T / P) on the current image
  const tagSlots = useTagSlots();
  // Iconic / outtake marks (2026-10-16): tags with their own buttons and keys
  const markTags = useMarkTags();
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

  // The marks are tiers (2026-10-17, media-mark-tiers.ts): setting one sets the
  // lower ones, clearing one clears the higher ones — each through its own write,
  // so the parent's ★ state and the tag list follow at once
  const setMark = useCallback(
    (key: MarkKey, on: boolean) => {
      if (!item) return;
      for (const [k, v] of Object.entries(markCascade(key, on)) as [MarkKey, boolean][]) {
        if (k === "favorite") {
          if ((item.isFavorite ?? false) !== v) handleFavorite(item.id);
        } else if (markTags && tagController) {
          if (tagController.directTagIds.includes(markTags[k].id) !== v) tagController.toggle(markTags[k], v);
        }
      }
    },
    [item, handleFavorite, markTags, tagController],
  );

  const { armed: armedTag, arm: armTag } = useArmedTag();
  const [armPaletteOpen, setArmPaletteOpen] = useState(false);
  const applyTagToCurrent = useCallback(
    (tag: PaletteTag, on?: boolean) => {
      if (!tagController) return;
      if (!tagFitsEntity(tag.group.domain, "MEDIA_ITEM")) {
        toast.message(`${tag.name} cannot be applied to an image`);
        return;
      }
      const has = tagController.directTagIds.includes(tag.id);
      const next = on ?? !has;
      if (next === has) {
        toast.message(has ? `Already tagged ${tag.name}` : `Not tagged ${tag.name}`);
        return;
      }
      // Iconic / outtake from the palette or a slot: with their tiers
      const mark = markTags && (["iconic", "outtake"] as const).find((k) => markTags[k].id === tag.id);
      if (mark) setMark(mark, next);
      else tagController.toggle(tag, next);
    },
    [tagController, markTags, setMark],
  );

  const toggleTagMark = useCallback(
    (key: "iconic" | "outtake") => {
      if (markTags && tagController) setMark(key, !tagController.directTagIds.includes(markTags[key].id));
    },
    [markTags, tagController, setMark],
  );

  // The damaged image was checked and is fine as stored: drop its red frame
  const handleDecodeIssueClear = useCallback((id: string) => {
    setDecodeClearedIds((prev) => new Set(prev).add(id));
    startDecodeClearTransition(async () => {
      const res = await clearMediaDecodeIssueAction(id);
      if (!res.success) {
        setDecodeClearedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error(res.error ?? "Could not clear the damage mark");
      } else {
        onDecodeIssueCleared?.(id);
        router.refresh();
      }
    });
  }, [router, onDecodeIssueCleared]);

  // ADR-0023: set the per-image "people shown" (persist the hidden set). Optimistic.
  const handleSetHidden = useCallback((id: string, hiddenIds: string[]) => {
    setLocalHiddenMap((m) => new Map(m).set(id, hiddenIds));
    onHiddenPersonsChange?.(id, hiddenIds);
    startHiddenTransition(async () => {
      await setMediaShownPeopleAction(id, hiddenIds);
    });
  }, [onHiddenPersonsChange]);

  // Support shown on the image (2026-10-24) — the reverse of hidden. Optimistic.
  const handleSetShownSupport = useCallback((id: string, shownIds: string[]) => {
    setLocalShownSupportMap((m) => new Map(m).set(id, shownIds));
    onShownSupportChange?.(id, shownIds);
    startHiddenTransition(async () => {
      const res = await setMediaShownSupportAction(id, shownIds);
      if (!res.success) toast.error(res.error ?? "Could not save who is shown");
    });
  }, [onShownSupportChange]);

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

  // A new collection was created from the palette/info panel for the current image:
  // surface it in both lists and mark the current image a member (server already added it).
  const handleCollectionCreated = useCallback(
    (collection: { id: string; name: string }) => {
      setCreatedCollections((prev) => (prev.some((c) => c.id === collection.id) ? prev : [...prev, collection]));
      handlePaletteMembership(collection.id, true);
    },
    [handlePaletteMembership],
  );

  const mergedPaletteCollections = useMemo(
    () => [
      ...paletteCollections,
      ...createdCollections.filter((cc) => !paletteCollections.some((p) => p.id === cc.id)),
    ],
    [paletteCollections, createdCollections],
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
  const toggleTray = useCallback(() => {
    if (!item) return;
    if (tray.has(item.id)) tray.remove(item.id);
    else tray.add({ mediaItemId: item.id, thumbUrl: item.urls.gallery_512 ?? item.urls.view_1200 ?? item.urls.original ?? null });
  }, [item, tray]);
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
    const baseColls = collectionContext?.collections ?? fetchedCollections;
    const collections = [
      ...baseColls,
      ...createdCollections.filter((cc) => !baseColls.some((b) => b.id === cc.id)),
    ];
    if (!collectionContext && collections.length === 0) return undefined;
    const base = collectionContext ?? { collections };
    return {
      ...base,
      collections,
      onCollectionIdsChange: (itemId: string, collIds: string[]) => {
        setLocalCollectionIdsMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, collIds);
          return next;
        });
        base.onCollectionIdsChange?.(itemId, collIds);
      },
    };
  }, [collectionContext, fetchedCollections, createdCollections]);

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
      // The delete confirmation owns the keyboard (Esc cancels it, not the viewer)
      if (deleteConfirmOpen || shortcutsOpen || toolbarMenu) return;

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
        case "s":
        case "S":
          setShowFilmstrip((p) => !p);
          break;
        case "t":
        case "T":
          // ADR-0033: tag palette for the current image; Shift+T arms a tag.
          if (item) {
            e.preventDefault();
            if (e.shiftKey) setArmPaletteOpen(true);
            else setTagPaletteOpen(true);
          }
          break;
        case "p":
        case "P":
          // ADR-0033 painter: P puts the armed tag on, Shift+P takes it off.
          if (item) {
            e.preventDefault();
            if (!armedTag) toast.message("No tag armed — Shift+T to arm one");
            else applyTagToCurrent(armedTag, !e.shiftKey);
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          // ADR-0033 quick-tag slots: toggle the slot's tag on the current image.
          if (!item || e.metaKey || e.ctrlKey || e.altKey) break;
          e.preventDefault();
          const slotTag = tagSlots.slotTag(Number(e.key));
          if (slotTag) applyTagToCurrent(slotTag);
          else toast.message(`Slot ${e.key} is empty`);
          break;
        }
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
        case "Delete":
        case "Backspace":
          // Delete the current image — always through the confirmation
          if (item && onDelete && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setDeleteConfirmOpen(true);
          }
          break;
        case ".":
          // ADR-0019: toggle global favorite on the current image.
          if (item) {
            e.preventDefault();
            setMark("favorite", !item.isFavorite);
          }
          break;
        case ",":
        case "-":
          // The outtake / iconic marks, either side of ★ on the keyboard —
          // lowest on the left, like the ladder on screen (2026-10-18)
          if (item && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            toggleTagMark(e.key === MARK_BY_KEY.iconic.hotkey ? "iconic" : "outtake");
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
        case "a":
        case "A":
          // ADR-0036, 3b: which ticked acts this photo is evidence for
          if (actEvidence && item && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setToolbarMenu("acts");
          }
          break;
        case "x":
        case "X":
          // The compare tray: add / remove the current image
          if (item && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            toggleTray();
          }
          break;
        case "#":
          // Set the current photo as the cover — the # is the cover badge's
          // shape. Sets only: on the cover already it says so rather than
          // taking the cover away (2026-10-18).
          if (item && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            if (!onSetCover) toast.message("This view has no cover to set");
            else if (coverMediaItemId === item.id) toast.message("Already the cover");
            else {
              onSetCover(item.id);
              toast.success("Cover set");
            }
          }
          break;
        case "o":
        case "O":
          // Back to the set the photo comes from, opened on it (2026-10-18)
          if (item && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            if (!showOrigin) toast.message("Back to its set works in favorites, collections and tags");
            else if (origin === undefined) toast.message("Still looking up where this photo comes from");
            else if (origin === null) toast.error("Could not tell where this photo comes from");
            else router.push(mediaOriginTarget(origin).href);
          }
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
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
  }, [onClose, goNext, goPrev, handleToggleInfoPanel, hasFocalPointSupport, canCopyToReference, handleCopyTrigger, setMark, addToTarget, item, armedTag, applyTagToCurrent, tagSlots, toggleTagMark, deleteConfirmOpen, shortcutsOpen, toolbarMenu, toggleTray, actEvidence, onDelete, onSetCover, coverMediaItemId, showOrigin, origin, router]);

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
    // The info panel's ★ is the current image's: with its tiers
    onFavoriteToggle: () => setMark("favorite", !item.isFavorite),
    tagController,
    onOpenTagPalette: () => setTagPaletteOpen(true),
    onApplySlot: (tag: PaletteTag) => applyTagToCurrent(tag),
    onArmRequest: () => setArmPaletteOpen(true),
    onFindSimilar,
    sessionId,
    onFocalPointChange: handleFocalPointChange,
    onFocalOverlayToggle: () => setFocalOverlay((p) => !p),
    focalOverlayActive: focalOverlay,
    referenceContext: augmentedReferenceContext,
    productionContext,
    collectionContext: augmentedCollectionContext,
    onCollectionCreated: enableCollections || collectionContext ? handleCollectionCreated : undefined,
    cast,
    onSetHiddenPersons: handleSetHidden,
    onSetShownSupport: handleSetShownSupport,
    showOrigin,
    origin,
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
      {/* Damaged source file — decoded leniently, missing parts show grey */}
      {item.decodeIssue && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 shrink-0 border-b border-red-500/40 bg-red-950/80 px-4 py-2 text-xs text-red-100"
        >
          <AlertTriangle size={14} className="shrink-0 text-red-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">Damaged file</span> — {item.decodeIssue}. Missing parts show
            grey, usually at the bottom. Keep it if it looks fine, or replace it with a good copy.
          </span>
          <button
            type="button"
            onClick={() => handleDecodeIssueClear(item.id)}
            disabled={isDecodeClearPending}
            className="rounded-md border border-red-400/40 bg-red-500/20 px-2.5 py-1 font-medium text-red-50 transition-colors hover:bg-red-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
          >
            Looks fine
          </button>
        </div>
      )}

      {/* Top bar — three zones (2026-10-17), see lightbox-toolbar.tsx */}
      <LightboxToolbar
        position={`${currentIndex + 1} / ${localItems.length}`}
        filename={item.filename}
        origin={showOrigin ? { value: origin } : undefined}
        zoomed={imgZoomed}
        marks={{
          iconic: markTags && tagController ? tagController.directTagIds.includes(markTags.iconic.id) : false,
          favorite: item.isFavorite ?? false,
          outtake: markTags && tagController ? tagController.directTagIds.includes(markTags.outtake.id) : false,
        }}
        tagMarksReady={!!(markTags && tagController)}
        onMark={(key) => (key === "favorite" ? setMark("favorite", !item.isFavorite) : toggleTagMark(key))}
        onCollection={() => setPaletteOpen(true)}
        onTag={() => setTagPaletteOpen(true)}
        onArm={() => setArmPaletteOpen(true)}
        onCategory={() => setAssignOpen(true)}
        acts={
          actEvidence && item
            ? {
                acts: actEvidence.acts,
                linked: actEvidence.linkedOf(item.id),
                onToggle: (contributionActId, linked) => actEvidence.onToggle(contributionActId, item.id, linked),
              }
            : undefined
        }
        armedTag={armedTag}
        onApplySlot={(tag) => applyTagToCurrent(tag)}
        slotStateOf={(tagId) => (tagController?.directTagIds.includes(tagId) ? "all" : "none")}
        compare={{ on: tray.has(item.id), toggle: toggleTray }}
        focal={{
          on: focalOverlay,
          toggle: () => setFocalOverlay((p) => !p),
          unavailable: hasFocalPointSupport ? null : "Not available in this gallery",
        }}
        filmstrip={{
          on: showFilmstrip,
          toggle: () => setShowFilmstrip((p) => !p),
          unavailable: localItems.length > 1 ? null : "Only one photo here",
        }}
        info={{ on: showInfoPanel, toggle: handleToggleInfoPanel }}
        onShortcuts={() => setShortcutsOpen(true)}
        copy={{
          unavailable: canCopyToReference ? null : "Only in a production set with a cast",
          busy: copyInFlight,
          onCopy: handleCopyTrigger,
        }}
        copyPicker={
          copyPickerOpen && copyToReferenceTargets && copyToReferenceTargets.length > 1 && (
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
          )
        }
        onEdit={onEdit ? () => onEdit(item) : null}
        onDelete={onDelete ? () => setDeleteConfirmOpen(true) : null}
        onClose={onClose}
        openMenu={toolbarMenu}
        onOpenMenuChange={setToolbarMenu}
      />

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
                    className={cn(
                      "absolute left-2 sm:left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-[color,background-color,opacity] duration-200 hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                      imgZoomed && "pointer-events-none opacity-0",
                    )}
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                {currentIndex < localItems.length - 1 && (
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next"
                    className={cn(
                      "absolute right-2 sm:right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-[color,background-color,opacity] duration-200 hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                      imgZoomed && "pointer-events-none opacity-0",
                    )}
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
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            deleteActionRef.current?.focus();
          }}
          // Esc cancels the confirmation only — it must not travel on and close the viewer
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the file and all associated metadata. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              ref={deleteActionRef}
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
              variant="destructive"
            >
              Delete permanently
              <kbd className="ml-2 rounded border border-white/30 px-1 text-[10px] opacity-80">Enter</kbd>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LightboxShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* ADR-0019: collection quick-add palette (hotkey b / toolbar) */}
      <TagPalette
        open={armPaletteOpen}
        onOpenChange={setArmPaletteOpen}
        entityType="MEDIA_ITEM"
        title="Arm a tag to paint with P"
        onPick={armTag}
      />
      {tagController && (
        <TagPalette
          open={tagPaletteOpen}
          onOpenChange={setTagPaletteOpen}
          entityType="MEDIA_ITEM"
          selectedTagIds={tagController.directTagIds}
          onToggle={tagController.toggle}
        />
      )}
      <CollectionQuickAddPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        mediaItemId={item?.id ?? null}
        collectionIds={item?.collectionIds ?? []}
        collections={mergedPaletteCollections}
        onMembershipChange={handlePaletteMembership}
        onCollectionCreated={handleCollectionCreated}
      />

      {/* Reverse assign-to-detail (hotkey d / toolbar) — mount only when open */}
      {assignOpen && item && (
        <DetailAssignSheet
          open
          onOpenChange={setAssignOpen}
          mediaItemId={item.id}
          mediaItemUrl={item.urls.original ?? item.urls.full_2400 ?? item.urls.view_1200 ?? displayUrl}
          defaultPerson={detailAssignContext?.defaultPerson ?? null}
          restrictTo={
            detailAssignContext?.restrictTo ??
            productionContext?.contributors.map((c) => ({ id: c.personId, name: c.personName }))
          }
        />
      )}
    </div>,
    document.body,
  );
}
