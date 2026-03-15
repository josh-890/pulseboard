"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { BodyModificationWithEvents } from "@/lib/types";
import {
  BODY_MODIFICATION_TYPE_STYLES,
  BODY_MODIFICATION_STATUS_STYLES,
  BODY_MODIFICATION_EVENT_STYLES,
} from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { Pencil, Trash2 } from "lucide-react";

type EntityMediaThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
};

type BodyModificationCardProps = {
  modification: BodyModificationWithEvents;
  photos?: EntityMediaThumbnail[];
  onEdit?: () => void;
  onDelete?: () => void;
  onDeleteEvent?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent?: () => void;
  isPending?: boolean;
};

export function BodyModificationCard({
  modification,
  photos,
  onEdit,
  onDelete,
  onDeleteEvent,
  onAddEvent,
  isPending,
}: BodyModificationCardProps) {
  const hasStructuredRegions = modification.bodyRegions.length > 0;
  const locationParts = hasStructuredRegions
    ? []
    : [modification.bodyRegion, modification.side, modification.position].filter(Boolean);

  return (
    <div className="group rounded-xl border border-white/10 bg-card/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
            BODY_MODIFICATION_TYPE_STYLES[modification.type],
          )}
        >
          {modification.type}
        </span>
        {hasStructuredRegions ? (
          <BodyRegionChips regions={modification.bodyRegions} compact />
        ) : (
          <span className="text-sm font-medium text-foreground/80">
            {locationParts.join(" · ")}
          </span>
        )}
        {modification.status !== "present" && (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
              BODY_MODIFICATION_STATUS_STYLES[modification.status],
            )}
          >
            {modification.status}
          </span>
        )}

        {(onEdit || onDelete) && (
          <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                disabled={isPending}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Edit body modification"
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
                aria-label="Delete body modification"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {modification.description && (
        <p className="text-sm text-muted-foreground">{modification.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {modification.material && (
          <span className="text-xs text-muted-foreground/70">Material: {modification.material}</span>
        )}
        {modification.gauge && (
          <span className="text-xs text-muted-foreground/70">Gauge: {modification.gauge}</span>
        )}
      </div>

      {photos && photos.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="shrink-0 h-14 w-14 overflow-hidden rounded-lg border border-white/10 bg-muted/30"
            >
              <Image
                src={photo.url}
                alt=""
                width={photo.width}
                height={photo.height}
                unoptimized
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {onDeleteEvent && onAddEvent && (
        <EntityEventTimeline
          events={modification.events}
          eventStyles={BODY_MODIFICATION_EVENT_STYLES}
          onDeleteEvent={onDeleteEvent}
          onAddEvent={onAddEvent}
          isPending={isPending}
        />
      )}
    </div>
  );
}
