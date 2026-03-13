"use client";

import { cn } from "@/lib/utils";
import type { BodyModificationWithEvents } from "@/lib/types";
import {
  BODY_MODIFICATION_TYPE_STYLES,
  BODY_MODIFICATION_STATUS_STYLES,
  BODY_MODIFICATION_EVENT_STYLES,
} from "@/lib/constants/body";
import { EntityEventTimeline } from "@/components/people/entity-event-timeline";
import { Pencil, Trash2 } from "lucide-react";

type BodyModificationCardProps = {
  modification: BodyModificationWithEvents;
  onEdit?: () => void;
  onDelete?: () => void;
  onDeleteEvent?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent?: () => void;
  isPending?: boolean;
};

export function BodyModificationCard({
  modification,
  onEdit,
  onDelete,
  onDeleteEvent,
  onAddEvent,
  isPending,
}: BodyModificationCardProps) {
  const locationParts = [modification.bodyRegion, modification.side, modification.position].filter(Boolean);

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
        <span className="text-sm font-medium text-foreground/80">
          {locationParts.join(" · ")}
        </span>
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
