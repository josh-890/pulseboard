"use client";

import Image from "next/image";
import { cn, focalStyle } from "@/lib/utils";
import type { BodyMarkWithEvents } from "@/lib/types";
import { BODY_MARK_TYPE_STYLES, BODY_MARK_STATUS_STYLES, BODY_MARK_EVENT_STYLES } from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { Camera, Pencil, Trash2 } from "lucide-react";

type EntityMediaThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
  focalX: number | null;
  focalY: number | null;
};

type BodyMarkCardProps = {
  mark: BodyMarkWithEvents;
  photos?: EntityMediaThumbnail[];
  onEdit?: () => void;
  onDelete?: () => void;
  onManagePhotos?: () => void;
  onDeleteEvent?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent?: () => void;
  isPending?: boolean;
};

export function BodyMarkCard({
  mark,
  photos,
  onEdit,
  onDelete,
  onManagePhotos,
  onDeleteEvent,
  onAddEvent,
  isPending,
}: BodyMarkCardProps) {
  // Fall back to free-text display if no structured regions
  const hasStructuredRegions = mark.bodyRegions.length > 0;
  const locationParts = hasStructuredRegions
    ? []
    : [mark.bodyRegion, mark.side, mark.position].filter(Boolean);

  return (
    <div className="group rounded-xl border border-white/10 bg-card/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
            BODY_MARK_TYPE_STYLES[mark.type],
          )}
        >
          {mark.type}
        </span>

        {hasStructuredRegions ? (
          <BodyRegionChips regions={mark.bodyRegions} compact />
        ) : (
          <span className="text-sm font-medium text-foreground/80">
            {locationParts.join(" · ")}
          </span>
        )}

        {mark.status !== "present" && (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
              BODY_MARK_STATUS_STYLES[mark.status],
            )}
          >
            {mark.status}
          </span>
        )}

        {(onEdit || onDelete || onManagePhotos) && (
          <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onManagePhotos && (
              <button
                type="button"
                onClick={onManagePhotos}
                className="rounded p-1 text-muted-foreground hover:text-amber-400 transition-colors"
                aria-label="Manage photos"
              >
                <Camera size={14} />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Edit body mark"
              >
                <Pencil size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:text-red-400 transition-colors"
                aria-label="Delete body mark"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {onDeleteEvent && onAddEvent && (
        <EntityEventTimeline
          events={mark.events}
          eventStyles={BODY_MARK_EVENT_STYLES}
          onDeleteEvent={onDeleteEvent}
          onAddEvent={onAddEvent}
          isPending={isPending}
        />
      )}

      {mark.motif && (
        <p className="text-sm font-medium text-foreground">{mark.motif}</p>
      )}
      {mark.description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{mark.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {mark.size && (
          <span className="text-xs text-muted-foreground/70">{mark.size}</span>
        )}
        {mark.colors.length > 0 && (
          <span className="text-xs text-muted-foreground/70">
            {mark.colors.join(", ")}
          </span>
        )}
      </div>

      {photos && photos.length > 0 && (
        <button
          type="button"
          onClick={onManagePhotos}
          className="mt-3 flex gap-1.5 overflow-x-auto pb-1 cursor-pointer group/photos"
          title="Manage photos"
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="shrink-0 h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-all group-hover/photos:border-amber-500/40"
            >
              <Image
                src={photo.url}
                alt=""
                width={photo.width}
                height={photo.height}
                unoptimized
                className="h-full w-full object-cover"
                style={focalStyle(photo.focalX, photo.focalY)}
              />
            </div>
          ))}
        </button>
      )}

    </div>
  );
}
