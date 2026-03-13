"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { recordPhysicalChangeAction } from "@/lib/actions/appearance-actions";

type RecordPhysicalChangeSheetProps = {
  personId: string;
  onClose: () => void;
};

export function RecordPhysicalChangeSheet({ personId, onClose }: RecordPhysicalChangeSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [currentHairColor, setCurrentHairColor] = useState("");
  const [weight, setWeight] = useState("");
  const [build, setBuild] = useState("");
  const [visionAids, setVisionAids] = useState("");
  const [fitnessLevel, setFitnessLevel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasAnyField = currentHairColor.trim() || weight.trim() || build.trim() || visionAids.trim() || fitnessLevel.trim();

  const handleSubmit = useCallback(() => {
    if (!hasAnyField) {
      setError("At least one physical field is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await recordPhysicalChangeAction(personId, {
        date: date || null,
        datePrecision,
        currentHairColor: currentHairColor.trim() || undefined,
        weight: weight.trim() ? parseFloat(weight) : undefined,
        build: build.trim() || undefined,
        visionAids: visionAids.trim() || undefined,
        fitnessLevel: fitnessLevel.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to record change.");
        return;
      }
      onClose();
    });
  }, [personId, date, datePrecision, currentHairColor, weight, build, visionAids, fitnessLevel, hasAnyField, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Record Physical Change</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <p className="text-sm text-muted-foreground">
            Only fill in what changed. A persona will be auto-created or matched by date.
          </p>

          {/* Date + Precision */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">When</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value && datePrecision === "UNKNOWN") setDatePrecision("DAY");
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
            {isPending ? "Saving..." : "Record Change"}
          </button>
        </div>
      </div>
    </div>
  );
}
