"use client";

import Image from "next/image";
import type { CosmeticProcedureWithEvents } from "@/lib/types";
import { COSMETIC_PROCEDURE_EVENT_STYLES } from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { Camera, Pencil, Trash2 } from "lucide-react";

type EntityMediaThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
};

type CosmeticProcedureCardProps = {
  procedure: CosmeticProcedureWithEvents;
  photos?: EntityMediaThumbnail[];
  onEdit?: () => void;
  onDelete?: () => void;
  onManagePhotos?: () => void;
  onDeleteEvent?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent?: () => void;
  isPending?: boolean;
};

export function CosmeticProcedureCard({
  procedure,
  photos,
  onEdit,
  onDelete,
  onManagePhotos,
  onDeleteEvent,
  onAddEvent,
  isPending,
}: CosmeticProcedureCardProps) {
  return (
    <div className="group rounded-xl border border-white/10 bg-card/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/15 px-2.5 py-0.5 text-xs font-medium capitalize text-purple-600 dark:text-purple-400">
          {procedure.type}
        </span>
        {procedure.bodyRegions.length > 0 ? (
          <BodyRegionChips regions={procedure.bodyRegions} compact />
        ) : (
          <span className="text-sm font-medium text-foreground/80">
            {procedure.bodyRegion}
          </span>
        )}
        {procedure.status !== "completed" && (
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
            {procedure.status}
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
                aria-label="Edit cosmetic procedure"
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
                aria-label="Delete cosmetic procedure"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {procedure.description && (
        <p className="text-sm text-muted-foreground">{procedure.description}</p>
      )}

      {procedure.provider && (
        <p className="mt-1 text-xs text-muted-foreground/70">Provider: {procedure.provider}</p>
      )}

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
              />
            </div>
          ))}
        </button>
      )}

      {onDeleteEvent && onAddEvent && (
        <EntityEventTimeline
          events={procedure.events}
          eventStyles={COSMETIC_PROCEDURE_EVENT_STYLES}
          onDeleteEvent={onDeleteEvent}
          onAddEvent={onAddEvent}
          isPending={isPending}
        />
      )}
    </div>
  );
}
