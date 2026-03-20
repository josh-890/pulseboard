"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { updatePhysicalChangeAction } from "@/lib/actions/appearance-actions";

type PhysicalChangeItem = {
  physicalId: string;
  personaId: string;
  personaLabel: string;
  isBaseline: boolean;
  date: Date | null;
  datePrecision: string;
  currentHairColor: string | null;
  weight: number | null;
  build: string | null;
  visionAids: string | null;
  fitnessLevel: string | null;
};

type EditPhysicalChangeSheetProps = {
  personId: string;
  item: PhysicalChangeItem;
  onClose: () => void;
};

export function EditPhysicalChangeSheet({ personId, item, onClose }: EditPhysicalChangeSheetProps) {
  const [isPending, startTransition] = useTransition();

  const initDate = item.isBaseline
    ? ""
    : item.date
      ? (() => {
          const d = new Date(item.date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })()
      : "";
  const initPrec = item.isBaseline ? "UNKNOWN" : (item.datePrecision ?? "UNKNOWN");

  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(initPrec);
  const [currentHairColor, setCurrentHairColor] = useState(item.currentHairColor ?? "");
  const [weight, setWeight] = useState(item.weight !== null ? String(item.weight) : "");
  const [build, setBuild] = useState(item.build ?? "");
  const [visionAids, setVisionAids] = useState(item.visionAids ?? "");
  const [fitnessLevel, setFitnessLevel] = useState(item.fitnessLevel ?? "");
  const [error, setError] = useState<string | null>(null);

  const hasAnyField = currentHairColor.trim() || weight.trim() || build.trim() || visionAids.trim() || fitnessLevel.trim();

  const handleSubmit = useCallback(() => {
    if (!hasAnyField) {
      setError("At least one physical field is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await updatePhysicalChangeAction(item.physicalId, personId, {
        date: date || null,
        datePrecision,
        currentHairColor: currentHairColor.trim() || undefined,
        weight: weight.trim() ? parseFloat(weight) : undefined,
        build: build.trim() || undefined,
        visionAids: visionAids.trim() || undefined,
        fitnessLevel: fitnessLevel.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update change.");
        return;
      }
      onClose();
    });
  }, [item.physicalId, personId, date, datePrecision, currentHairColor, weight, build, visionAids, fitnessLevel, hasAnyField, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Physical Change</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <p className="text-sm text-muted-foreground">
            Editing physical change from <span className="font-medium text-foreground">{item.personaLabel}</span>.
          </p>

          <PartialDateInput
            dateValue={date}
            precisionValue={datePrecision}
            onDateChange={setDate}
            onPrecisionChange={setDatePrecision}
            label="When"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium">Current Hair Color</label>
            <input
              type="text"
              value={currentHairColor}
              onChange={(e) => setCurrentHairColor(e.target.value)}
              placeholder="e.g. blonde, brunette, red..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Weight (kg)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 65"
              step="0.1"
              min="0"
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Build</label>
            <input
              type="text"
              value={build}
              onChange={(e) => setBuild(e.target.value)}
              placeholder="e.g. slim, athletic, muscular..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Vision Aids</label>
            <input
              type="text"
              value={visionAids}
              onChange={(e) => setVisionAids(e.target.value)}
              placeholder="e.g. glasses, contacts, none..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Fitness Level</label>
            <input
              type="text"
              value={fitnessLevel}
              onChange={(e) => setFitnessLevel(e.target.value)}
              placeholder="e.g. sedentary, moderate, athletic..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !hasAnyField}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
