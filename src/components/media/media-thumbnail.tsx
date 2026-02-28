"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import {
  MediaUsageBadge,
  MediaTagCountBadge,
  MediaLinkIcon,
  MediaCollectionIcon,
} from "./media-badge";

type MediaThumbnailProps = {
  item: MediaItemWithLinks;
  width: number;
  height: number;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
};

export function MediaThumbnail({
  item,
  width,
  height,
  isSelected,
  isMultiSelectMode,
  onSelect,
  onOpen,
}: MediaThumbnailProps) {
  const thumbUrl = item.urls.gallery_512 || item.urls.original || null;
  if (!thumbUrl) return null;

  const primaryLink = item.links[0];
  const hasEntityLink =
    primaryLink &&
    (primaryLink.bodyMarkId ||
      primaryLink.bodyModificationId ||
      primaryLink.cosmeticProcedureId);

  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-lg transition-all duration-150",
        isSelected
          ? "ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg"
          : "hover:shadow-lg",
      )}
      style={{ width, height }}
    >
      {/* Image */}
      <button
        type="button"
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey || isMultiSelectMode) {
            onSelect(item.id, e);
          } else {
            onSelect(item.id, e);
          }
        }}
        onDoubleClick={() => onOpen(item.id)}
        className="h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={item.caption ?? item.filename}
      >
        <Image
          src={thumbUrl}
          alt={item.caption ?? item.filename}
          width={Math.round(width)}
          height={Math.round(height)}
          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          unoptimized
        />
      </button>

      {/* Selection checkbox overlay */}
      <div
        className={cn(
          "absolute left-1.5 top-1.5 z-10 transition-opacity duration-100",
          isSelected || isMultiSelectMode
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item.id, e);
          }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border transition-colors",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/70 bg-black/40 text-transparent hover:border-white hover:bg-black/60",
          )}
          aria-label={isSelected ? "Deselect" : "Select"}
          aria-pressed={isSelected}
        >
          <Check size={12} strokeWidth={3} />
        </button>
      </div>

      {/* Badge tray (bottom-right) */}
      <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-0.5">
        {primaryLink && (
          <MediaUsageBadge usage={primaryLink.usage} slot={primaryLink.slot} />
        )}
        {item.tags.length > 0 && (
          <MediaTagCountBadge count={item.tags.length} />
        )}
        {hasEntityLink && <MediaLinkIcon />}
        {item.collectionIds.length > 0 && <MediaCollectionIcon />}
      </div>
    </div>
  );
}
