"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, focalStyle } from "@/lib/utils";
import type { BodyModificationWithEvents } from "@/lib/types";
import {
  BODY_MODIFICATION_TYPE_STYLES,
  BODY_MODIFICATION_STATUS_STYLES,
  BODY_MODIFICATION_EVENT_STYLES,
} from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { ExpandedEntityView } from "@/components/people/expanded-entity-view";
import { EntityStatusPill } from "@/components/people/entity-status-pill";
import { Camera, ChevronRight, ImageIcon, Pencil, Plus, ScanSearch, Trash2, Upload } from "lucide-react";
import { useFileDrop } from "@/lib/hooks/use-file-drop";

type EntityMediaThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
  focalX: number | null;
  focalY: number | null;
};

type EventItem = {
  id: string;
  eventType: string;
  notes: string | null;
  date?: Date | null;
  datePrecision?: string;
  dateModifier?: string;
  era: { id: string; label: string; date: Date | null; datePrecision?: string; isBaseline?: boolean };
};

type BodyModificationRowProps = {
  modification: BodyModificationWithEvents;
  photos?: EntityMediaThumbnail[];
  onEdit?: () => void;
  onDelete?: () => void;
  onManagePhotos?: () => void;
  onUploadPhoto?: () => void;
  onDropFiles?: (files: FileList) => void;
  onDeleteEvent?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent?: () => void;
  onEditEvent?: (event: EventItem) => void;
  onSelectFromSessions?: () => void;
  onViewPhotos?: (index: number) => void;
  isPending?: boolean;
  // Phase G Slice 13: Level-2 interactivity.
  isHighlighted?: boolean;
  onHover?: (entering: boolean) => void;
};

export function BodyModificationRow({
  modification,
  photos,
  onEdit,
  onDelete,
  onManagePhotos,
  onUploadPhoto,
  onDropFiles,
  onDeleteEvent,
  onAddEvent,
  onEditEvent,
  onSelectFromSessions,
  onViewPhotos,
  isPending,
  isHighlighted,
  onHover,
}: BodyModificationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { isDragOver, dropProps } = useFileDrop(onDropFiles);
  const c = modification.computed;
  const hasStructuredRegions = c.bodyRegions.length > 0;
  const locationParts = hasStructuredRegions
    ? []
    : [modification.bodyRegion, modification.side, modification.position].filter(Boolean);
  const photoCount = photos?.length ?? 0;
  const firstEvent = modification.events.find((e) => e.eventType === "added");
  const firstEventDate = firstEvent?.date ?? firstEvent?.era.date;
  const year = firstEventDate
    ? new Date(firstEventDate).getUTCFullYear()
    : null;
  const isBaselineDate = !firstEvent?.date && (firstEvent?.era.isBaseline ?? false);

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card/30 transition-all",
        isHighlighted
          ? "border-teal-500/60 ring-2 ring-teal-500/30"
          : "border-white/10 hover:border-white/15",
      )}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
    >
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
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
            BODY_MODIFICATION_TYPE_STYLES[modification.type],
          )}
        >
          {modification.type}
        </span>
        <span className="min-w-0 truncate text-sm text-foreground/80">
          {hasStructuredRegions ? (
            <BodyRegionChips regions={c.bodyRegions} compact />
          ) : (
            locationParts.join(" · ")
          )}
        </span>
        {modification.status !== "present" && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize",
              BODY_MODIFICATION_STATUS_STYLES[modification.status],
            )}
          >
            {modification.status}
          </span>
        )}
        {photoCount > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
            <ImageIcon size={11} />
            {photoCount}
          </span>
        )}
        {year && (
          isBaselineDate ? (
            <span
              className="shrink-0 rounded-full border border-white/10 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title="Year derived from baseline era"
            >
              baseline
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">{year}</span>
          )
        )}
      </button>

      {expanded && (
        <div className="relative border-t border-white/5 px-3 pb-3 pt-2" {...dropProps}>
          <ExpandedEntityView
            toolbar={
              <>
                {/* Phase G Slice 15: per-instance Pin/PinOff dropped along
                    with the heroVisible/heroOrder columns — hero now uses
                    presentBodyFeatureTypes (one chip per type). */}
                {onManagePhotos && (
                  <button type="button" onClick={onManagePhotos} className="rounded p-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors" aria-label="Manage photos">
                    <Camera size={14} />
                  </button>
                )}
                {onSelectFromSessions && (
                  <button type="button" onClick={onSelectFromSessions} className="rounded p-1 text-xs text-muted-foreground hover:text-indigo-400 transition-colors" aria-label="Select from any session" title="Select from any session">
                    <ScanSearch size={14} />
                  </button>
                )}
                {onUploadPhoto && (
                  <button type="button" onClick={onUploadPhoto} className="rounded p-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors" aria-label="Upload detail photo" title="Upload detail photo">
                    <Upload size={14} />
                  </button>
                )}
                {onEdit && (
                  <button type="button" onClick={onEdit} disabled={isPending} className="rounded p-1 text-xs text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit body modification">
                    <Pencil size={14} />
                  </button>
                )}
                {onDelete && (
                  <button type="button" onClick={onDelete} disabled={isPending} className="rounded p-1 text-xs text-muted-foreground hover:text-red-400 transition-colors" aria-label="Delete body modification">
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            }
            status={<EntityStatusPill status={modification.status} />}
            currentProperties={
              (c.description || c.material || c.gauge) ? (
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                  {c.material && (
                    <>
                      <dt className="text-muted-foreground">Material</dt>
                      <dd className="text-foreground/80">{c.material}</dd>
                    </>
                  )}
                  {c.gauge && (
                    <>
                      <dt className="text-muted-foreground">Gauge</dt>
                      <dd className="text-foreground/80">{c.gauge}</dd>
                    </>
                  )}
                  {c.description && (
                    <>
                      <dt className="text-muted-foreground">Description</dt>
                      <dd className="text-foreground/80">{c.description}</dd>
                    </>
                  )}
                </dl>
              ) : undefined
            }
            photos={
              photos && photos.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1">
                  {photos.map((photo, idx) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => onViewPhotos ? onViewPhotos(idx) : onManagePhotos?.()}
                      className="shrink-0 h-20 w-20 snap-start overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-all hover:border-amber-500/40 cursor-pointer"
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
                    </button>
                  ))}
                </div>
              ) : undefined
            }
            lifecycle={
              onDeleteEvent && onAddEvent ? (
                <div className="space-y-2">
                  <EntityEventTimeline
                    events={modification.events}
                    eventStyles={BODY_MODIFICATION_EVENT_STYLES}
                    onDeleteEvent={onDeleteEvent}
                    onAddEvent={onAddEvent}
                    onEditEvent={onEditEvent}
                    isPending={isPending}
                  />
                  <button
                    type="button"
                    onClick={onAddEvent}
                    disabled={isPending}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus size={12} /> Record event
                  </button>
                </div>
              ) : undefined
            }
          />

          {/* Drop overlay */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/10 backdrop-blur-[1px]">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <Upload size={14} />
                Drop to upload
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
