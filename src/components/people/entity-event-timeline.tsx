"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type EventItem = {
  id: string;
  eventType: string;
  notes: string | null;
  persona: { id: string; label: string; date: Date | null; datePrecision?: string; isBaseline?: boolean };
};

type EventStyle = { color: string; label: string };

type EntityEventTimelineProps = {
  events: EventItem[];
  eventStyles: Record<string, EventStyle>;
  onDeleteEvent: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent: () => void;
  onEditEvent?: (event: EventItem) => void;
  isPending?: boolean;
};

const TERMINAL_EVENT_TYPES = ["removed", "reversed"];

type DotColors = { bg: string; ring: string; dot: string };

const POPOVER_COLOR_MAP: Record<string, DotColors> = {
  "text-green-400": {
    bg: "bg-green-500",
    ring: "ring-green-500/50",
    dot: "text-green-400",
  },
  "text-amber-400": {
    bg: "bg-amber-500",
    ring: "ring-amber-500/50",
    dot: "text-amber-400",
  },
  "text-red-400": {
    bg: "bg-red-500",
    ring: "ring-red-500/50",
    dot: "text-red-400",
  },
};

const DEFAULT_POPOVER_COLORS: DotColors = {
  bg: "bg-muted-foreground",
  ring: "ring-muted-foreground/50",
  dot: "text-muted-foreground",
};

const ACTIVE_COLORS: DotColors = {
  bg: "bg-emerald-500",
  ring: "ring-emerald-500/50",
  dot: "text-emerald-400",
};

const HISTORICAL_COLORS: DotColors = {
  bg: "bg-amber-500",
  ring: "ring-amber-500/50",
  dot: "text-amber-400",
};

function getDotColors(index: number, total: number, isTerminal: boolean): DotColors {
  const isLast = index === total - 1;
  return isLast && !isTerminal ? ACTIVE_COLORS : HISTORICAL_COLORS;
}

function getYear(date: Date | null): string {
  if (!date) return "";
  return new Date(date).getFullYear().toString();
}

function TimelineDot({
  event,
  style,
  dotColors,
  popoverColors,
  onDelete,
  onEdit,
  isPending,
}: {
  event: EventItem;
  style: EventStyle;
  dotColors: DotColors;
  popoverColors: DotColors;
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
  onEdit?: (event: EventItem) => void;
  isPending?: boolean;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const year = getYear(event.persona.date);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-3 w-3 shrink-0 rounded-full transition-all",
            dotColors.bg,
            "hover:ring-2 hover:ring-offset-2 hover:ring-offset-card",
            `hover:${dotColors.ring}`,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            `focus-visible:${dotColors.ring}`,
          )}
          aria-label={`${style.label} event${year ? ` (${year})` : ""}`}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-auto min-w-[160px] max-w-[240px] p-3"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", popoverColors.bg)}
            />
            <span className={cn("text-sm font-medium", popoverColors.dot)}>
              {style.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {year && <span>{year}</span>}
            {year && event.persona.label && <span> · </span>}
            {event.persona.label && <span>{event.persona.label}</span>}
          </div>
          {event.notes && (
            <p className="text-xs text-muted-foreground/70">{event.notes}</p>
          )}
          <div className="flex items-center gap-3 border-t border-foreground/10 pt-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(event)}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Pencil size={12} />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDeletingId(event.id);
                startTransition(async () => {
                  await onDelete(event.id);
                  setDeletingId(null);
                });
              }}
              disabled={deletingId === event.id || isPending}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function EntityEventTimeline({
  events,
  eventStyles,
  onDeleteEvent,
  onAddEvent,
  onEditEvent,
  isPending,
}: EntityEventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEvent = events[events.length - 1];
  const isTerminal =
    lastEvent && TERMINAL_EVENT_TYPES.includes(lastEvent.eventType);

  useEffect(() => {
    if (scrollRef.current && events.length > 4) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="mt-2 flex items-center">
        <button
          type="button"
          onClick={onAddEvent}
          disabled={isPending}
          className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 text-foreground/30 transition-colors hover:border-foreground/60 hover:text-foreground/60 disabled:opacity-50"
          aria-label="Add first event"
        >
          <Plus size={8} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "mt-2 flex w-full items-center overflow-x-auto",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {events.map((event, i) => {
        const style = eventStyles[event.eventType] ?? {
          color: "text-muted-foreground",
          label: event.eventType,
        };
        const popoverColors = POPOVER_COLOR_MAP[style.color] ?? DEFAULT_POPOVER_COLORS;
        const dotColors = getDotColors(i, events.length, !!isTerminal);

        return (
          <div key={event.id} className="flex items-center">
            {i > 0 && (
              <div className="h-0.5 w-4 bg-foreground/20" />
            )}
            <TimelineDot
              event={event}
              style={style}
              dotColors={dotColors}
              popoverColors={popoverColors}
              onDelete={onDeleteEvent}
              onEdit={onEditEvent}
              isPending={isPending}
            />
          </div>
        );
      })}

      {isTerminal && (
        <>
          <div className="h-0.5 w-4 bg-foreground/20" />
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/60" />
        </>
      )}

      {!isTerminal && (
        <>
          <div className="w-4 border-t border-dashed border-foreground/20" />
          <button
            type="button"
            onClick={onAddEvent}
            disabled={isPending}
            className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 text-foreground/30 transition-colors hover:border-foreground/60 hover:text-foreground/60 disabled:opacity-50"
            aria-label="Add event"
          >
            <Plus size={8} />
          </button>
        </>
      )}
    </div>
  );
}
