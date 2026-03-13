"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { createCosmeticProcedureAction } from "@/lib/actions/appearance-actions";

type AddCosmeticProcedureSheetProps = {
  personId: string;
  onClose: () => void;
};

export function AddCosmeticProcedureSheet({ personId, onClose }: AddCosmeticProcedureSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState("");
  const [bodyRegion, setBodyRegion] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!type.trim()) { setError("Procedure type is required."); return; }
    if (!bodyRegion.trim()) { setError("Body region is required."); return; }
    startTransition(async () => {
      setError(null);
      const result = await createCosmeticProcedureAction(personId, {
        type: type.trim(),
        bodyRegion: bodyRegion.trim(),
        description: description.trim() || undefined,
        provider: provider.trim() || undefined,
        date: date || null,
        datePrecision,
      });
      if (!result.success) { setError(result.error ?? "Failed to create procedure."); return; }
      onClose();
    });
  }, [personId, type, bodyRegion, description, provider, date, datePrecision, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Add Cosmetic Procedure</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Type</label>
            <input type="text" value={type} onChange={(e) => setType(e.target.value)}
              placeholder="e.g. lip filler, rhinoplasty, botox..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Body Region</label>
            <input type="text" value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)}
              placeholder="e.g. lips, nose, forehead..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Procedure details..." rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Provider</label>
            <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)}
              placeholder="Clinic or practitioner..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <div>
            <PartialDateInput
              dateValue={date}
              precisionValue={datePrecision}
              onDateChange={setDate}
              onPrecisionChange={setDatePrecision}
              label="When (for auto-persona)"
            />
            <p className="mt-1 text-xs text-muted-foreground/60">A persona will be auto-created or matched by date.</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={isPending || !type.trim() || !bodyRegion.trim()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Creating..." : "Create Cosmetic Procedure"}
          </button>
        </div>
      </div>
    </div>
  );
}
