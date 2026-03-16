"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";
import {
  InlineUploadZone,
  cleanupPendingFiles,
  uploadAndLinkFiles,
} from "@/components/shared/inline-upload-zone";
import type { PendingFile } from "@/components/shared/inline-upload-zone";
import { getRegionLabel } from "@/lib/constants/body-regions";
import { createCosmeticProcedureAction } from "@/lib/actions/appearance-actions";

type AddCosmeticProcedureSheetProps = {
  personId: string;
  referenceSessionId?: string;
  categoryId?: string;
  onClose: () => void;
};

export function AddCosmeticProcedureSheet({ personId, referenceSessionId, categoryId, onClose }: AddCosmeticProcedureSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState("");
  const [bodyRegions, setBodyRegions] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const handleSubmit = useCallback(() => {
    if (!type.trim()) { setError("Procedure type is required."); return; }
    if (bodyRegions.length === 0) { setError("At least one body region is required."); return; }
    startTransition(async () => {
      setError(null);
      const primaryRegion = bodyRegions[0];
      const result = await createCosmeticProcedureAction(personId, {
        type: type.trim(),
        bodyRegion: getRegionLabel(primaryRegion),
        bodyRegions,
        description: description.trim() || undefined,
        provider: provider.trim() || undefined,
        date: date || null,
        datePrecision,
      });
      if (!result.success) { setError(result.error ?? "Failed to create procedure."); return; }
      if (pendingFiles.length > 0 && referenceSessionId && categoryId && result.id) {
        await uploadAndLinkFiles(
          pendingFiles,
          referenceSessionId,
          personId,
          categoryId,
          "cosmeticProcedureId",
          result.id,
        );
        cleanupPendingFiles(pendingFiles);
      }
      onClose();
    });
  }, [personId, type, bodyRegions, description, provider, date, datePrecision, pendingFiles, referenceSessionId, categoryId, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
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

          {/* Body Region Picker */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Body Region</label>
            <BodyRegionCompact
              value={bodyRegions}
              onChange={setBodyRegions}
              mode="single"
            />
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

          {/* Inline photo upload */}
          {referenceSessionId && categoryId && (
            <InlineUploadZone
              pendingFiles={pendingFiles}
              onPendingFilesChange={setPendingFiles}
            />
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={isPending || !type.trim() || bodyRegions.length === 0}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Creating..." : "Create Cosmetic Procedure"}
          </button>
        </div>
      </div>
    </div>
  );
}
