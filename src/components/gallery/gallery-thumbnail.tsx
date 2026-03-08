"use client";

import Image from "next/image";
import { Check, Frame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import {
  MediaUsageBadge,
  MediaTagCountBadge,
  MediaLinkIcon,
  MediaCollectionIcon,
} from "@/components/media/media-badge";

type GalleryThumbnailProps = {
  item: GalleryItem;
  width: number;
  height: number;
  selectable?: boolean;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  draggable?: boolean;
  onSelect?: (id: string, e: React.MouseEvent) => void;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
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
}: GalleryThumbnailProps) {
  const imgSrc = item.urls.gallery_512 ?? item.urls.original;
  if (!imgSrc) return null;

  const tagCount = item.tags.filter((t) => !t.startsWith("p-img")).length;
  const hasProfileSlot = item.tags.some((t) => t.startsWith("p-img"));
  const hasEntityLink = item.links?.some(
    (l) => l.bodyMarkId || l.bodyModificationId || l.cosmeticProcedureId,
  );
  const hasCollections = (item.collectionIds?.length ?? 0) > 0;

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
    onToggleSelect?.(item.id);
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
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item.id);
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

      {/* Cover badge */}
      {item.isCover && (
        <span
          className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white"
          aria-label="Cover image"
        >
          <Frame size={10} />
        </span>
      )}

      {/* Badge tray */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
        {/* Usage badges (MediaManager mode) */}
        {item.links?.map((link) => (
          <MediaUsageBadge key={link.id} usage={link.usage} slot={link.slot} />
        ))}
        {/* Profile slot indicator (legacy tag mode) */}
        {!item.links?.length && hasProfileSlot && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
            aria-label="Has profile slot"
          >
            P
          </span>
        )}
        <MediaTagCountBadge count={tagCount} />
        {hasEntityLink && <MediaLinkIcon />}
        {hasCollections && <MediaCollectionIcon />}
      </div>
    </div>
  );
}
