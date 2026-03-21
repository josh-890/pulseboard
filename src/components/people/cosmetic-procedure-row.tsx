"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, focalStyle } from "@/lib/utils";
import type { CosmeticProcedureWithEvents } from "@/lib/types";
import { COSMETIC_PROCEDURE_EVENT_STYLES } from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { Camera, ChevronRight, ImageIcon, Pencil, Trash2 } from "lucide-react";

type EntityMediaThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
  focalX: number | null;
  focalY: number | null;
};

type CosmeticProcedureRowProps = {
  procedure: CosmeticProcedureWithEvents;
  photos?: EntityMediaThumbnail[];
  onEdit?: () => void;
  onDelete?: () => void;
  onManagePhotos?: () => void;
  onDeleteEvent?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent?: () => void;
  isPending?: boolean;
};

export function CosmeticProcedureRow({
  procedure,
  photos,
  onEdit,
  onDelete,
  onManagePhotos,
  onDeleteEvent,
  onAddEvent,
  isPending,
}: CosmeticProcedureRowProps) {
  const [expanded, setExpanded] = useState(false);
  const photoCount = photos?.length ?? 0;
  const firstEvent = procedure.events.find((e) => e.eventType === "performed");
  const year = firstEvent?.persona.date
    ? new Date(firstEvent.persona.date).getFullYear()
    : null;

  return (
    <div className="group rounded-lg border border-white/10 bg-card/30 transition-colors hover:border-white/15">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight
          size={14}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="inline-flex shrink-0 items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[11px] font-medium capitalize text-purple-600 dark:text-purple-400">
          {procedure.type}
        </span>
        <span className="min-w-0 truncate text-sm text-foreground/80">
          {procedure.bodyRegions.length > 0 ? (
            <BodyRegionChips regions={procedure.bodyRegions} compact />
          ) : (
            procedure.bodyRegion
          )}
        </span>
        {procedure.status !== "completed" && (
          <span className="shrink-0 rounded-full border border-white/15 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
            {procedure.status}
          </span>
        )}
        {photoCount > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
            <ImageIcon size={11} />
            {photoCount}
          </span>
        )}
        {year && (
          <span className="shrink-0 text-[11px] text-muted-foreground">{year}</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2">
          <div className="mb-2 flex items-center gap-1">
            {onManagePhotos && (
              <button type="button" onClick={onManagePhotos} className="rounded p-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors" aria-label="Manage photos">
                <Camera size={14} />
              </button>
            )}
            {onEdit && (
              <button type="button" onClick={onEdit} disabled={isPending} className="rounded p-1 text-xs text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit cosmetic procedure">
                <Pencil size={14} />
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} disabled={isPending} className="rounded p-1 text-xs text-muted-foreground hover:text-red-400 transition-colors" aria-label="Delete cosmetic procedure">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {procedure.description && (
            <p className="text-sm text-muted-foreground">{procedure.description}</p>
          )}
          {procedure.provider && (
            <p className="mt-1 text-xs text-muted-foreground/70">Provider: {procedure.provider}</p>
          )}

          {onDeleteEvent && onAddEvent && (
            <div className="mt-2">
              <EntityEventTimeline
                events={procedure.events}
                eventStyles={COSMETIC_PROCEDURE_EVENT_STYLES}
                onDeleteEvent={onDeleteEvent}
                onAddEvent={onAddEvent}
                isPending={isPending}
              />
            </div>
          )}

          {photos && photos.length > 0 && (
            <button
              type="button"
              onClick={onManagePhotos}
              className="mt-2 flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 cursor-pointer"
              title="Manage photos"
            >
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="shrink-0 h-20 w-20 snap-start overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-all hover:border-amber-500/40"
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
      )}
    </div>
  );
}
