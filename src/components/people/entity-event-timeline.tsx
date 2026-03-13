"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type EventItem = {
  id: string;
  eventType: string;
  notes: string | null;
  persona: { id: string; label: string; date: Date | null };
};

type EventStyle = { color: string; label: string };

type EntityEventTimelineProps = {
  events: EventItem[];
  eventStyles: Record<string, EventStyle>;
  onDeleteEvent: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddEvent: () => void;
  isPending?: boolean;
};

export function EntityEventTimeline({
  events,
  eventStyles,
  onDeleteEvent,
  onAddEvent,
  isPending,
}: EntityEventTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (events.length === 0 && !expanded) {
    return (
      <button
        type="button"
        onClick={onAddEvent}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus size={12} />
        Add event
      </button>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {events.length} {events.length === 1 ? "event" : "events"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 border-l border-white/10 pl-3">
          {events.map((event) => {
            const style = eventStyles[event.eventType] ?? { color: "text-muted-foreground", label: event.eventType };
            return (
              <div
                key={event.id}
                className="group flex items-start gap-2 text-sm"
              >
                <div className="flex-1">
                  <span className={cn("font-medium capitalize", style.color)}>
                    {style.label}
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {event.persona.label}
                  </span>
                  {event.notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground/70">{event.notes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeletingId(event.id);
                    startTransition(async () => {
                      await onDeleteEvent(event.id);
                      setDeletingId(null);
                    });
                  }}
                  disabled={deletingId === event.id || isPending}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                  aria-label="Delete event"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAddEvent}
            disabled={isPending}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Plus size={12} />
            Add event
          </button>
        </div>
      )}
    </div>
  );
}
