"use client";

import { useCallback, useState, useTransition } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BodyModificationEventType } from "@/generated/prisma/client";
import { BODY_MODIFICATION_EVENT_TYPES, BODY_MODIFICATION_EVENT_STYLES } from "@/lib/constants/body";
import { createBodyModificationEventAction } from "@/lib/actions/appearance-actions";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";

type BodyModificationComputed = {
  bodyRegions: string[];
  description: string | null;
  material: string | null;
  gauge: string | null;
};

type AddBodyModificationEventDialogProps = {
  personId: string;
  bodyModificationId: string;
  modificationLabel: string;
  currentComputed: BodyModificationComputed;
  onClose: () => void;
};

const AVAILABLE_EVENT_TYPES = BODY_MODIFICATION_EVENT_TYPES.filter((t) => t !== "added");

export function AddBodyModificationEventDialog({
  personId,
  bodyModificationId,
  modificationLabel,
  currentComputed,
  onClose,
}: AddBodyModificationEventDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<BodyModificationEventType>(AVAILABLE_EVENT_TYPES[0]);
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [notes, setNotes] = useState("");
  const [propsOpen, setPropsOpen] = useState(false);

  // Property overrides
  const [bodyRegions, setBodyRegions] = useState<string[]>(currentComputed.bodyRegions);
  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("");
  const [gauge, setGauge] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const result = await createBodyModificationEventAction(personId, {
        bodyModificationId,
        eventType,
        date: date || null,
        datePrecision,
        notes: notes.trim() || undefined,
        bodyRegions: JSON.stringify(bodyRegions) !== JSON.stringify(currentComputed.bodyRegions) ? bodyRegions : undefined,
        description: description.trim() || undefined,
        material: material.trim() || undefined,
        gauge: gauge.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to add event.");
        return;
      }
      onClose();
    });
  }, [personId, bodyModificationId, eventType, date, datePrecision, notes, bodyRegions, currentComputed.bodyRegions, description, material, gauge, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Event</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          for <span className="font-medium text-foreground">{modificationLabel}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_EVENT_TYPES.map((et) => {
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

          <PartialDateInput
            dateValue={date}
            precisionValue={datePrecision}
            onDateChange={setDate}
            onPrecisionChange={setDatePrecision}
            label="Date"
          />

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

          {/* Collapsible property overrides */}
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setPropsOpen(!propsOpen)}
              className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} className={cn("transition-transform", propsOpen && "rotate-90")} />
              Property Changes
              <span className="text-xs font-normal text-muted-foreground/60">(optional)</span>
            </button>

            {propsOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Body Regions</label>
                  <BodyRegionCompact value={bodyRegions} onChange={setBodyRegions} mode="multi" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={currentComputed.description ?? "Detailed description..."}
                    rows={2}
                    className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Material</label>
                    <input
                      type="text"
                      value={material}
                      onChange={(e) => setMaterial(e.target.value)}
                      placeholder={currentComputed.material ?? "e.g. titanium..."}
                      className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Gauge</label>
                    <input
                      type="text"
                      value={gauge}
                      onChange={(e) => setGauge(e.target.value)}
                      placeholder={currentComputed.gauge ?? "e.g. 16g..."}
                      className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

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
            {isPending ? "Adding..." : "Add Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
