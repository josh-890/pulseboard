"use client";

import { TagDotStrip } from "@/components/tags";
import Image from "next/image";
import { Check, Frame, Heart, Maximize2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import {
  MediaUsageBadge,
  MediaLinkIcon,
  MediaCollectionIcon,
  MediaSetCountBadge,
} from "@/components/media/media-badge";

/** The modifier keys a selection gesture carries (mouse or keyboard). */
export type SelectModifiers = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

type GalleryThumbnailProps = {
  item: GalleryItem;
  width: number;
  height: number;
  selectable?: boolean;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  draggable?: boolean;
  onSelect?: (id: string, e: React.MouseEvent) => void;
  onToggleSelect?: (id: string, mods: SelectModifiers) => void;
  onOpen: (id: string) => void;
  showFavoriteBadge?: boolean;
  /** A hover button that opens the lightbox — for grids where a click selects. */
  showOpenButton?: boolean;
};

export function GalleryThumbnail({
  item,
  width,
  height,
  selectable,
  isSelected = false,
  isMultiSelectMode = false,
  draggable: isDraggable = false,
  onSelect,
  onToggleSelect,
  onOpen,
  showFavoriteBadge = true,
  showOpenButton = false,
}: GalleryThumbnailProps) {
  const imgSrc = item.urls.gallery_512 ?? item.urls.original;
  if (!imgSrc) return null;

  const hasEntityLink = item.links?.some(
    (l) => l.bodyMarkId || l.bodyModificationId || l.cosmeticProcedureId,
  );
  const hasCollections = (item.collectionIds?.length ?? 0) > 0;

  // Per-image appearance (ADR-0023): show a subset badge ONLY when this image
  // doesn't show its full session cast (i.e. someone was deselected).
  const sessionCastCount = item.sessionCastIds?.length ?? 0;
  const castSet = item.sessionCastIds ? new Set(item.sessionCastIds) : null;
  const hiddenCount = castSet
    ? (item.hiddenPersonIds ?? []).filter((id) => castSet.has(id)).length
    : 0;
  const isSubset = sessionCastCount > 0 && hiddenCount > 0;
  const shownCount = sessionCastCount - hiddenCount;

  function handleClick(e: React.MouseEvent) {
    if (selectable && onSelect) {
      onSelect(item.id, e);
    } else {
      onOpen(item.id);
    }
  }

  function handleDoubleClick() {
    if (selectable) {
      onOpen(item.id);
    }
  }

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleSelect?.(item.id, e);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={isDraggable}
      onDragStart={
        isDraggable
          ? (e) => {
              e.dataTransfer.setData("application/x-media-id", item.id);
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => {
        // Shift+click extends a selection; without this the browser also
        // highlights the text between the two clicks.
        if (selectable && e.shiftKey) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item.id);
        else if (e.key === " " && selectable && onToggleSelect) {
          e.preventDefault();
          onToggleSelect(item.id, e);
        }
      }}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-lg transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-primary",
        selectable ? "cursor-pointer" : "cursor-zoom-in",
        selectable && isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
      style={{ width, height }}
      aria-label={item.caption ?? "Gallery image"}
    >
      <Image
        src={imgSrc}
        alt={item.caption ?? "Gallery image"}
        width={Math.round(width)}
        height={Math.round(height)}
        className={cn(
          "h-full w-full object-contain transition-transform duration-150",
          !selectable && "group-hover:scale-105",
        )}
        unoptimized
      />

      {/* Selection checkbox (selectable mode) */}
      {selectable && (
        <button
          type="button"
          onClick={handleCheckboxClick}
          className={cn(
            "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border transition-all",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/50 bg-black/30 text-transparent",
            !isMultiSelectMode && !isSelected && "opacity-0 group-hover:opacity-100",
          )}
          aria-label={isSelected ? "Deselect" : "Select"}
        >
          <Check size={12} />
        </button>
      )}

      {/* Cover badge — shift right when select checkbox is visible */}
      {item.isCover && (
        <span
          className={cn(
            "absolute top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white pointer-events-none",
            selectable ? "left-8" : "left-1.5",
          )}
          aria-label="Cover image"
        >
          <Frame size={10} />
        </span>
      )}

      {/* Open in lightbox — the click itself may be busy selecting */}
      {showOpenButton && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(item.id);
          }}
          className={cn(
            "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white",
            "opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100",
            "hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label="Open image"
          title="Open"
        >
          <Maximize2 size={12} />
        </button>
      )}

      {/* Favorite badge (top-right) — ADR-0019 global favorite */}
      {showFavoriteBadge && item.isFavorite && (
        <span
          className={cn(
            "absolute top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white pointer-events-none",
            showOpenButton ? "right-9" : "right-1.5",
          )}
          aria-label="Favorite"
        >
          <Heart size={10} fill="currentColor" />
        </span>
      )}

      {/* Set count badge (bottom-left) */}
      {item.setCount !== undefined && item.setCount > 0 && (
        <div className="absolute bottom-1.5 left-1.5">
          <MediaSetCountBadge count={item.setCount} />
        </div>
      )}

      {/* Badge tray */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
        {/* Subset badge — only when not all of the session cast is shown (ADR-0023) */}
        {isSubset && (
          <span
            className="pointer-events-none inline-flex items-center gap-0.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white"
            title={`${shownCount} of ${sessionCastCount} people shown`}
            aria-label={`${shownCount} of ${sessionCastCount} people shown`}
          >
            <Users size={9} /> {shownCount}/{sessionCastCount}
          </span>
        )}
        {/* Usage badges (MediaManager mode) */}
        {item.links?.map((link) => (
          <MediaUsageBadge key={link.id} usage={link.usage} />
        ))}
        {hasEntityLink && <MediaLinkIcon />}
        {hasCollections && <MediaCollectionIcon />}
        <TagDotStrip tags={item.tags} />
      </div>
    </div>
  );
}
