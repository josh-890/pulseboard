"use client";

import { useCallback, useState, useTransition } from "react";
import { ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";

type EventItem = {
  id: string;
  eventType: string;
  notes: string | null;
  persona: { id: string; label: string; date: Date | null; datePrecision?: string; isBaseline?: boolean };
};

type EventStyle = { color: string; label: string };

type BodyMarkOverrides = {
  bodyRegions: string[];
  motif: string | null;
  colors: string[];
  size: string | null;
  description: string | null;
};

type BodyModificationOverrides = {
  bodyRegions: string[];
  description: string | null;
  material: string | null;
  gauge: string | null;
};

type CosmeticProcedureOverrides = {
  bodyRegions: string[];
  description: string | null;
  provider: string | null;
  valueBefore: string | null;
  valueAfter: string | null;
  unit: string | null;
};

type EditEventDialogProps = {
  event: EventItem;
  entityId: string;
  eventTypes: string[];
  eventStyles: Record<string, EventStyle>;
  onSave: (data: {
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    motif?: string | null;
    colors?: string[];
    size?: string | null;
    description?: string | null;
    material?: string | null;
    gauge?: string | null;
    provider?: string | null;
    valueBefore?: string | null;
    valueAfter?: string | null;
    unit?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
} & (
  | { entityKind: "bodyMark"; overrides: BodyMarkOverrides }
  | { entityKind: "bodyModification"; overrides: BodyModificationOverrides }
  | { entityKind: "cosmeticProcedure"; overrides: CosmeticProcedureOverrides }
  | { entityKind?: undefined; overrides?: undefined }
);

function formatDateForInput(date: Date | null, isBaseline?: boolean): string {
  if (isBaseline || !date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function EditEventDialog(props: EditEventDialogProps) {
  const { event, eventTypes, eventStyles, onSave, onClose, entityKind, overrides } = props;
  const [isPending, startTransition] = useTransition();
  const [eventType, setEventType] = useState(event.eventType);
  const initDate = formatDateForInput(event.persona.date, event.persona.isBaseline);
  const initPrec = event.persona.isBaseline ? "UNKNOWN" : (event.persona.datePrecision ?? "UNKNOWN");
  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(initPrec);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [propsOpen, setPropsOpen] = useState(false);

  // Property override state — initialized from existing event overrides
  const [bodyRegions, setBodyRegions] = useState<string[]>(overrides?.bodyRegions ?? []);
  const [motif, setMotif] = useState(entityKind === "bodyMark" ? (overrides.motif ?? "") : "");
  const [colors, setColors] = useState(entityKind === "bodyMark" ? (overrides.colors.join(", ")) : "");
  const [size, setSize] = useState(entityKind === "bodyMark" ? (overrides.size ?? "") : "");
  const [description, setDescription] = useState(
    entityKind === "bodyMark" || entityKind === "bodyModification" || entityKind === "cosmeticProcedure"
      ? (overrides.description ?? "")
      : "",
  );
  const [material, setMaterial] = useState(entityKind === "bodyModification" ? (overrides.material ?? "") : "");
  const [gauge, setGauge] = useState(entityKind === "bodyModification" ? (overrides.gauge ?? "") : "");
  const [provider, setProvider] = useState(entityKind === "cosmeticProcedure" ? (overrides.provider ?? "") : "");
  const [valueBefore, setValueBefore] = useState(entityKind === "cosmeticProcedure" ? (overrides.valueBefore ?? "") : "");
  const [valueAfter, setValueAfter] = useState(entityKind === "cosmeticProcedure" ? (overrides.valueAfter ?? "") : "");
  const [unitValue, setUnitValue] = useState(entityKind === "cosmeticProcedure" ? (overrides.unit ?? "") : "");

  const hasOverrideFields = entityKind !== undefined;

  const handleSubmit = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const saveData: Parameters<typeof onSave>[0] = {
        eventType,
        date: date || null,
        datePrecision,
        notes: notes.trim() || undefined,
      };

      if (entityKind === "bodyMark") {
        saveData.bodyRegions = bodyRegions;
        saveData.motif = motif.trim() || null;
        saveData.colors = colors.trim() ? colors.split(",").map((c) => c.trim()) : [];
        saveData.size = size.trim() || null;
        saveData.description = description.trim() || null;
      } else if (entityKind === "bodyModification") {
        saveData.bodyRegions = bodyRegions;
        saveData.description = description.trim() || null;
        saveData.material = material.trim() || null;
        saveData.gauge = gauge.trim() || null;
      } else if (entityKind === "cosmeticProcedure") {
        saveData.bodyRegions = bodyRegions;
        saveData.description = description.trim() || null;
        saveData.provider = provider.trim() || null;
        saveData.valueBefore = valueBefore.trim() || null;
        saveData.valueAfter = valueAfter.trim() || null;
        saveData.unit = unitValue.trim() || null;
      }

      const result = await onSave(saveData);
      if (!result.success) {
        setError(result.error ?? "Failed to update event.");
        return;
      }
      onClose();
    });
  }, [eventType, date, datePrecision, notes, entityKind, bodyRegions, motif, colors, size, description, material, gauge, provider, valueBefore, valueAfter, unitValue, onSave, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Event</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Event Type</label>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((et) => {
                const style = eventStyles[et] ?? { color: "text-muted-foreground", label: et };
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

          {/* Property override fields */}
          {hasOverrideFields && (
            <div className="border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setPropsOpen(!propsOpen)}
                className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight size={14} className={cn("transition-transform", propsOpen && "rotate-90")} />
                Property Overrides
              </button>

              {propsOpen && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Body Regions</label>
                    <BodyRegionCompact value={bodyRegions} onChange={setBodyRegions} mode="multi" />
                  </div>

                  {entityKind === "bodyMark" && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Motif</label>
                        <input
                          type="text"
                          value={motif}
                          onChange={(e) => setMotif(e.target.value)}
                          placeholder="Design or pattern name..."
                          className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Colors</label>
                          <input
                            type="text"
                            value={colors}
                            onChange={(e) => setColors(e.target.value)}
                            placeholder="black, red..."
                            className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Size</label>
                          <input
                            type="text"
                            value={size}
                            onChange={(e) => setSize(e.target.value)}
                            placeholder="small, 5cm..."
                            className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {(entityKind === "bodyMark" || entityKind === "bodyModification" || entityKind === "cosmeticProcedure") && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Detailed description..."
                        rows={2}
                        className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                  )}

                  {entityKind === "bodyModification" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Material</label>
                        <input
                          type="text"
                          value={material}
                          onChange={(e) => setMaterial(e.target.value)}
                          placeholder="e.g. titanium..."
                          className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Gauge</label>
                        <input
                          type="text"
                          value={gauge}
                          onChange={(e) => setGauge(e.target.value)}
                          placeholder="e.g. 16g..."
                          className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                  )}

                  {entityKind === "cosmeticProcedure" && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Provider</label>
                        <input
                          type="text"
                          value={provider}
                          onChange={(e) => setProvider(e.target.value)}
                          placeholder="Clinic or practitioner..."
                          className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div className="border-t border-white/5 pt-3">
                        <label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value Change</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Before</label>
                            <input
                              type="text"
                              value={valueBefore}
                              onChange={(e) => setValueBefore(e.target.value)}
                              placeholder="e.g. A cup"
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
                            value={unitValue}
                            onChange={(e) => setUnitValue(e.target.value)}
                            placeholder="e.g. cup size, mm"
                            className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
            {isPending ? "Saving..." : "Update Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
