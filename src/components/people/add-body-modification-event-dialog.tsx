"use client";

import { useCallback, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BodyModificationEventType } from "@/generated/prisma/client";
import { BODY_MODIFICATION_EVENT_TYPES, BODY_MODIFICATION_EVENT_STYLES } from "@/lib/constants/body";
import { createBodyModificationEventAction } from "@/lib/actions/appearance-actions";

type PersonaOption = { id: string; label: string };

type AddBodyModificationEventDialogProps = {
  personId: string;
  bodyModificationId: string;
  modificationLabel: string;
  personas: PersonaOption[];
  onClose: () => void;
};

export function AddBodyModificationEventDialog({
  personId,
  bodyModificationId,
  modificationLabel,
  personas,
  onClose,
}: AddBodyModificationEventDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<BodyModificationEventType>("modified");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [notes, setNotes] = useState("");

  const handleSubmit = useCallback(() => {
    if (!personaId) return;
    startTransition(async () => {
      await createBodyModificationEventAction(personId, {
        bodyModificationId,
        personaId,
        eventType,
        notes: notes.trim() || undefined,
      });
      onClose();
    });
  }, [personId, bodyModificationId, eventType, personaId, notes, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-background p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Modification Event</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Record an event for <span className="font-medium text-foreground">{modificationLabel}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {BODY_MODIFICATION_EVENT_TYPES.map((et) => {
                const style = BODY_MODIFICATION_EVENT_STYLES[et];
                return (
                  <button
                    key={et}
                    type="button"
                    onClick={() => setEventType(et)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                      eventType === et
                        ? `${style.color} border-current bg-current/10`
                        : "border-white/15 text-muted-foreground hover:border-white/30",
                    )}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Persona</label>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Select a persona...</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context..."
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !personaId}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Plus size={14} />
            Add Event
          </button>
        </div>
      </div>
    </div>
  );
}
