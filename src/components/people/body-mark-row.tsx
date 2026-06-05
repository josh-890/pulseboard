"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, focalStyle } from "@/lib/utils";
import type { BodyMarkWithEvents } from "@/lib/types";
import { BODY_MARK_TYPE_STYLES, BODY_MARK_STATUS_STYLES, BODY_MARK_EVENT_STYLES } from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { ExpandedEntityView } from "@/components/people/expanded-entity-view";
import { EntityStatusPill } from "@/components/people/entity-status-pill";
import { Camera, ChevronRight, ImageIcon, Pencil, Plus, ScanSearch, Star, Trash2, Upload } from "lucide-react";
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

type BodyMarkRowProps = {
  mark: BodyMarkWithEvents;
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
  /** Make a photo the cover (first → body-map hover). Receives the mediaItemId. */
  onSetCover?: (mediaItemId: string) => void;
  isPending?: boolean;
  // Phase G Slice 13: Level-2 interactivity.
  isHighlighted?: boolean;
  onHover?: (entering: boolean) => void;
};

export function BodyMarkRow({
  mark,
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
  onSetCover,
  isPending,
  isHighlighted,
  onHover,
}: BodyMarkRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { isDragOver, dropProps } = useFileDrop(onDropFiles);
  const c = mark.computed;
  const hasStructuredRegions = c.bodyRegions.length > 0;
  const locationParts = hasStructuredRegions
    ? []
    : [mark.bodyRegion, mark.side, mark.position].filter(Boolean);
  const photoCount = photos?.length ?? 0;
  const firstEvent = mark.events.find((e) => e.eventType === "added");
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
          ? "border-amber-500/60 ring-2 ring-amber-500/30"
          : "border-white/10 hover:border-white/15",
      )}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
    >
      {/* Collapsed row */}
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
            BODY_MARK_TYPE_STYLES[mark.type],
          )}
        >
          {mark.type}
        </span>
        <span className="min-w-0 truncate text-sm text-foreground/80">
          {hasStructuredRegions ? (
            <BodyRegionChips regions={c.bodyRegions} compact />
          ) : (
            locationParts.join(" · ")
          )}
        </span>
        {mark.status !== "present" && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize",
              BODY_MARK_STATUS_STYLES[mark.status],
            )}
          >
            {mark.status}
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

      {/* Inline actions (always visible on row hover) */}
      {(onEdit || onDelete || onManagePhotos) && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" style={{ position: "absolute" }}>
          {/* Actions are shown in expanded view instead */}
        </div>
      )}

      {/* Expanded details — Phase G Slice 12: 4-section structure */}
      {expanded && (
        <div className="relative border-t border-white/5 px-3 pb-3 pt-2" {...dropProps}>
          <ExpandedEntityView
            toolbar={
              <>
                {/* Phase G Slice 15: the per-mark Pin/PinOff toggle was
                    removed when the hero card switched from per-instance
                    chips to type-presence chips driven by
                    PersonCurrentState.presentBodyFeatureTypes. */}
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
                  <button type="button" onClick={onEdit} disabled={isPending} className="rounded p-1 text-xs text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit body mark">
                    <Pencil size={14} />
                  </button>
                )}
                {onDelete && (
                  <button type="button" onClick={onDelete} disabled={isPending} className="rounded p-1 text-xs text-muted-foreground hover:text-red-400 transition-colors" aria-label="Delete body mark">
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            }
            status={<EntityStatusPill status={mark.status} />}
            currentProperties={
              (c.motif || c.description || c.size || c.colors.length > 0) ? (
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                  {c.motif && (
                    <>
                      <dt className="text-muted-foreground">Motif</dt>
                      <dd className="font-medium text-foreground">{c.motif}</dd>
                    </>
                  )}
                  {c.colors.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Colors</dt>
                      <dd className="text-foreground/80">{c.colors.join(", ")}</dd>
                    </>
                  )}
                  {c.size && (
                    <>
                      <dt className="text-muted-foreground">Size</dt>
                      <dd className="text-foreground/80">{c.size}</dd>
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
                    <div key={photo.id} className="group/photo relative h-20 w-20 shrink-0 snap-start">
                      <button
                        type="button"
                        onClick={() => onViewPhotos ? onViewPhotos(idx) : onManagePhotos?.()}
                        className="h-full w-full overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-all hover:border-amber-500/40 cursor-pointer"
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
                      {idx === 0 ? (
                        <span
                          className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-medium text-white"
                          title="Shown on the body map"
                        >
                          <Star size={9} className="fill-current" /> Cover
                        </span>
                      ) : onSetCover ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSetCover(photo.id); }}
                          className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:text-amber-400 group-hover/photo:opacity-100"
                          title="Set as cover (show on body map)"
                          aria-label="Set as cover"
                        >
                          <Star size={11} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : undefined
            }
            lifecycle={
              onDeleteEvent && onAddEvent ? (
                <div className="space-y-2">
                  <EntityEventTimeline
                    events={mark.events}
                    eventStyles={BODY_MARK_EVENT_STYLES}
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
