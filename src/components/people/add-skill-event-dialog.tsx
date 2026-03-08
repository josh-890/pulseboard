"use client";

import { useCallback, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillLevel, SkillEventType } from "@/generated/prisma/client";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_STYLES,
  SKILL_EVENT_TYPES,
  SKILL_EVENT_STYLES,
} from "@/lib/constants/skill";
import { createSkillEventAction } from "@/lib/actions/skill-actions";

type PersonaOption = { id: string; label: string };

type AddSkillEventDialogProps = {
  personId: string;
  personSkillId: string;
  skillName: string;
  personas: PersonaOption[];
  onClose: () => void;
};

export function AddSkillEventDialog({
  personId,
  personSkillId,
  skillName,
  personas,
  onClose,
}: AddSkillEventDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<SkillEventType>("DEMONSTRATED");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [notes, setNotes] = useState("");

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      await createSkillEventAction(personId, {
        personSkillId,
        personaId: personaId || null,
        eventType,
        level: (level as SkillLevel) || null,
        notes: notes || null,
        date: date || null,
        datePrecision,
      });
      onClose();
    });
  }, [personId, personSkillId, eventType, level, personaId, date, datePrecision, notes, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-background p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Skill Event</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Record an event for <span className="font-medium text-foreground">{skillName}</span>
        </p>

        <div className="space-y-4">
          {/* Event type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Event Type
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILL_EVENT_TYPES.map((et) => {
                const style = SKILL_EVENT_STYLES[et];
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

          {/* Level at event time */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Level at Event (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILL_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(level === l ? "" : l)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                    level === l
                      ? SKILL_LEVEL_STYLES[l]
                      : "border-white/15 text-muted-foreground hover:border-white/30",
                  )}
                >
                  {SKILL_LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Date (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value && datePrecision === "UNKNOWN") {
                    setDatePrecision("DAY");
                  }
                }}
                className="flex-1 rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                value={datePrecision}
                onChange={(e) => setDatePrecision(e.target.value)}
                className="w-28 rounded-lg border border-white/15 bg-muted/30 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="YEAR">Year</option>
                <option value="MONTH">Month</option>
                <option value="DAY">Day</option>
              </select>
            </div>
          </div>

          {/* Persona (optional) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Persona (optional)
            </label>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No persona</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context..."
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
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
