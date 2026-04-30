"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, focalStyle } from "@/lib/utils";
import type { BodyMarkWithEvents } from "@/lib/types";
import { BODY_MARK_TYPE_STYLES, BODY_MARK_STATUS_STYLES, BODY_MARK_EVENT_STYLES } from "@/lib/constants/body";
import { BodyRegionChips } from "@/components/shared/body-region-picker";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { Camera, ChevronRight, ImageIcon, Pencil, Pin, PinOff, ScanSearch, Trash2, Upload } from "lucide-react";
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
  persona: { id: string; label: string; date: Date | null; datePrecision?: string; isBaseline?: boolean };
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
  onToggleHeroVisibility?: (visible: boolean) => void;
  isPending?: boolean;
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
  onToggleHeroVisibility,
  isPending,
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
  const firstEventDate = firstEvent?.date ?? firstEvent?.persona.date;
  const year = firstEventDate
    ? new Date(firstEventDate).getUTCFullYear()
    : null;
  const isBaselineDate = !firstEvent?.date && (firstEvent?.persona.isBaseline ?? false);

  return (
    <div className="group rounded-lg border border-white/10 bg-card/30 transition-colors hover:border-white/15">
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
              title="Year derived from baseline persona"
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

      {/* Expanded details */}
      {expanded && (
        <div className="relative border-t border-white/5 px-3 pb-3 pt-2" {...dropProps}>
          {/* Action buttons */}
          <div className="mb-2 flex items-center gap-1">
            {onToggleHeroVisibility && (
              <button
                type="button"
                onClick={() => onToggleHeroVisibility(!mark.heroVisible)}
                disabled={isPending}
                className={cn(
                  "rounded p-1 text-xs transition-colors",
                  mark.heroVisible ? "text-amber-400 hover:text-muted-foreground" : "text-muted-foreground hover:text-amber-400",
                )}
                aria-label={mark.heroVisible ? "Unpin from hero card" : "Pin to hero card"}
                title={mark.heroVisible ? "Unpin from hero card" : "Pin to hero card"}
              >
                {mark.heroVisible ? <Pin size={14} /> : <PinOff size={14} />}
              </button>
            )}
            {onManagePhotos && (
              <button
                type="button"
                onClick={onManagePhotos}
                className="rounded p-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors"
                aria-label="Manage photos"
              >
                <Camera size={14} />
              </button>
            )}
            {onSelectFromSessions && (
              <button
                type="button"
                onClick={onSelectFromSessions}
                className="rounded p-1 text-xs text-muted-foreground hover:text-indigo-400 transition-colors"
                aria-label="Select from any session"
                title="Select from any session"
              >
                <ScanSearch size={14} />
              </button>
            )}
            {onUploadPhoto && (
              <button
                type="button"
                onClick={onUploadPhoto}
                className="rounded p-1 text-xs text-muted-foreground hover:text-amber-400 transition-colors"
                aria-label="Upload detail photo"
                title="Upload detail photo"
              >
                <Upload size={14} />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                disabled={isPending}
                className="rounded p-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                className="rounded p-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
                aria-label="Delete body mark"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {c.motif && (
            <p className="text-sm font-medium text-foreground">{c.motif}</p>
          )}
          {c.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
          )}
          {(c.size || c.colors.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
              {c.size && <span>{c.size}</span>}
              {c.colors.length > 0 && <span>{c.colors.join(", ")}</span>}
            </div>
          )}

          {onDeleteEvent && onAddEvent && (
            <div className="mt-2">
              <EntityEventTimeline
                events={mark.events}
                eventStyles={BODY_MARK_EVENT_STYLES}
                onDeleteEvent={onDeleteEvent}
                onAddEvent={onAddEvent}
                onEditEvent={onEditEvent}
                isPending={isPending}
              />
            </div>
          )}

          {photos && photos.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1">
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
          )}

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
