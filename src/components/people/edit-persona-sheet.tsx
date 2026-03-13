"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { updatePersonaAction } from "@/lib/actions/appearance-actions";

type EditPersonaSheetProps = {
  personId: string;
  persona: {
    id: string;
    label: string;
    date: Date | null;
    datePrecision: string;
    notes: string | null;
    isBaseline: boolean;
  };
  onClose: () => void;
};

export function EditPersonaSheet({ personId, persona, onClose }: EditPersonaSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState(persona.label);
  const [date, setDate] = useState(
    persona.date ? new Date(persona.date).toISOString().slice(0, 10) : "",
  );
  const [datePrecision, setDatePrecision] = useState(persona.datePrecision);
  const [notes, setNotes] = useState(persona.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await updatePersonaAction(persona.id, personId, {
        label: label.trim(),
        date: date || undefined,
        datePrecision: datePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY",
        notes: notes.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update persona.");
        return;
      }
      onClose();
    });
  }, [persona.id, personId, label, date, datePrecision, notes, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Persona</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. March 2024, Post-surgery..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Date</label>
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
            <label className="mb-1.5 block text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context about this persona..."
              rows={3}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !label.trim()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
