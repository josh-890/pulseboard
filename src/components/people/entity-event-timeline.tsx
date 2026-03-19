"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  isPending?: boolean;
};

const TERMINAL_EVENT_TYPES = ["removed", "reversed"];

const COLOR_MAP: Record<string, { bg: string; ring: string; dot: string }> = {
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

const DEFAULT_COLORS = {
  bg: "bg-muted-foreground",
  ring: "ring-muted-foreground/50",
  dot: "text-muted-foreground",
};

function getYear(date: Date | null): string {
  if (!date) return "";
  return new Date(date).getFullYear().toString();
}

function TimelineDot({
  event,
  style,
  colors,
  onDelete,
  isPending,
}: {
  event: EventItem;
  style: EventStyle;
  colors: { bg: string; ring: string; dot: string };
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
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
            colors.bg,
            "hover:ring-2 hover:ring-offset-2 hover:ring-offset-card",
            `hover:${colors.ring}`,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            `focus-visible:${colors.ring}`,
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
              className={cn("h-2 w-2 shrink-0 rounded-full", colors.bg)}
            />
            <span className={cn("text-sm font-medium", colors.dot)}>
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
          <div className="border-t border-white/10 pt-1.5">
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
          className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-dashed border-white/30 text-white/30 transition-colors hover:border-white/60 hover:text-white/60 disabled:opacity-50"
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
        "mt-2 flex items-center overflow-x-auto",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {events.map((event, i) => {
        const style = eventStyles[event.eventType] ?? {
          color: "text-muted-foreground",
          label: event.eventType,
        };
        const colors = COLOR_MAP[style.color] ?? DEFAULT_COLORS;

        return (
          <div key={event.id} className="flex items-center">
            {i > 0 && (
              <div className="h-0.5 min-w-4 flex-1 bg-white/20" />
            )}
            <TimelineDot
              event={event}
              style={style}
              colors={colors}
              onDelete={onDeleteEvent}
              isPending={isPending}
            />
          </div>
        );
      })}

      {!isTerminal && (
        <>
          <div className="min-w-4 flex-1 border-t border-dashed border-white/20" />
          <button
            type="button"
            onClick={onAddEvent}
            disabled={isPending}
            className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-dashed border-white/30 text-white/30 transition-colors hover:border-white/60 hover:text-white/60 disabled:opacity-50"
            aria-label="Add event"
          >
            <Plus size={8} />
          </button>
        </>
      )}
    </div>
  );
}
