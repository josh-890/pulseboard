"use client";

import { useCallback, useState, useTransition } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CosmeticProcedureEventType } from "@/generated/prisma/client";
import { COSMETIC_PROCEDURE_EVENT_TYPES, COSMETIC_PROCEDURE_EVENT_STYLES } from "@/lib/constants/body";
import { createCosmeticProcedureEventAction } from "@/lib/actions/appearance-actions";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";

type CosmeticProcedureComputed = {
  bodyRegions: string[];
  description: string | null;
  provider: string | null;
  valueAfter: string | null;
  unit: string | null;
};

type AddCosmeticProcedureEventDialogProps = {
  personId: string;
  cosmeticProcedureId: string;
  procedureLabel: string;
  currentComputed: CosmeticProcedureComputed;
  onClose: () => void;
};

const AVAILABLE_EVENT_TYPES = COSMETIC_PROCEDURE_EVENT_TYPES.filter((t) => t !== "performed");

export function AddCosmeticProcedureEventDialog({
  personId,
  cosmeticProcedureId,
  procedureLabel,
  currentComputed,
  onClose,
}: AddCosmeticProcedureEventDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<CosmeticProcedureEventType>(AVAILABLE_EVENT_TYPES[0]);
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [notes, setNotes] = useState("");
  const [propsOpen, setPropsOpen] = useState(false);

  // Property overrides
  const [bodyRegions, setBodyRegions] = useState<string[]>(currentComputed.bodyRegions);
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  // Observation fields
  const [valueBefore, setValueBefore] = useState("");
  const [valueAfter, setValueAfter] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const result = await createCosmeticProcedureEventAction(personId, {
        cosmeticProcedureId,
        eventType,
        date: date || null,
        datePrecision,
        notes: notes.trim() || undefined,
        bodyRegions: JSON.stringify(bodyRegions) !== JSON.stringify(currentComputed.bodyRegions) ? bodyRegions : undefined,
        description: description.trim() || undefined,
        provider: provider.trim() || undefined,
        valueBefore: valueBefore.trim() || null,
        valueAfter: valueAfter.trim() || null,
        unit: unit.trim() || null,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to add event.");
        return;
      }
      onClose();
    });
  }, [personId, cosmeticProcedureId, eventType, date, datePrecision, notes, bodyRegions, currentComputed.bodyRegions, description, provider, valueBefore, valueAfter, unit, onClose]);

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
          for <span className="font-medium text-foreground">{procedureLabel}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_EVENT_TYPES.map((et) => {
                const style = COSMETIC_PROCEDURE_EVENT_STYLES[et];
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
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Provider</label>
                  <input
                    type="text"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder={currentComputed.provider ?? "Clinic or practitioner..."}
                    className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Value Change (observation) */}
                <div className="border-t border-white/5 pt-3">
                  <label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value Change</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Before</label>
                      <input
                        type="text"
                        value={valueBefore}
                        onChange={(e) => setValueBefore(e.target.value)}
                        placeholder={currentComputed.valueAfter ?? "e.g. A cup"}
                        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">After</label>
                      <input
                        type="text"
                        value={valueAfter}
                        onChange={(e) => setValueAfter(e.target.value)}
                        placeholder="e.g. D cup"
                        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Unit</label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder={currentComputed.unit ?? "e.g. cup size, mm"}
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
