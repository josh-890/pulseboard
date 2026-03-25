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
import type { CosmeticProcedureWithEvents } from "@/lib/types";
import { updateCosmeticProcedureAction } from "@/lib/actions/appearance-actions";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";

type EditCosmeticProcedureSheetProps = {
  personId: string;
  procedure: CosmeticProcedureWithEvents;
  referenceSessionId?: string;
  categoryId?: string;
  existingPhotos?: EntityMediaThumbnail[];
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
  onClose: () => void;
};

function formatDateForInput(date: Date | null, isBaseline?: boolean): string {
  if (isBaseline || !date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function EditCosmeticProcedureSheet({ personId, procedure, referenceSessionId, categoryId, existingPhotos, attributeGroups, onClose }: EditCosmeticProcedureSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(procedure.type);
  const [bodyRegions, setBodyRegions] = useState<string[]>(
    procedure.bodyRegions.length > 0 ? procedure.bodyRegions : [],
  );
  const [description, setDescription] = useState(procedure.description ?? "");
  const [provider, setProvider] = useState(procedure.provider ?? "");
  const [attributeDefinitionId, setAttributeDefinitionId] = useState(procedure.attributeDefinitionId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  // Single-event convenience
  const isSingleEvent = procedure.events.length === 1;
  const initialEvent = procedure.events[0];
  const initDate = isSingleEvent ? formatDateForInput(initialEvent?.persona.date ?? null, initialEvent?.persona.isBaseline) : "";
  const initPrec = isSingleEvent ? (initialEvent?.persona.isBaseline ? "UNKNOWN" : (initialEvent?.persona.datePrecision ?? "UNKNOWN")) : "UNKNOWN";
  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(initPrec);

  const handleSubmit = useCallback(() => {
    if (!type.trim()) { setError("Type is required."); return; }
    if (bodyRegions.length === 0) { setError("At least one body region is required."); return; }
    startTransition(async () => {
      setError(null);
      const primaryRegion = bodyRegions[0];
      const result = await updateCosmeticProcedureAction(procedure.id, personId, {
        type: type.trim(),
        bodyRegion: getRegionLabel(primaryRegion),
        bodyRegions,
        description: description.trim() || undefined,
        provider: provider.trim() || undefined,
        attributeDefinitionId: attributeDefinitionId || null,
        ...(isSingleEvent ? { singleEventDate: date || null, singleEventDatePrecision: datePrecision } : {}),
      });
      if (!result.success) { setError(result.error ?? "Failed to update."); return; }
      if (pendingFiles.length > 0 && referenceSessionId && categoryId) {
        await uploadAndLinkFiles(
          pendingFiles,
          referenceSessionId,
          personId,
          categoryId,
          "cosmeticProcedureId",
          procedure.id,
        );
        cleanupPendingFiles(pendingFiles);
      }
      onClose();
    });
  }, [procedure.id, personId, type, bodyRegions, description, provider, attributeDefinitionId, isSingleEvent, date, datePrecision, pendingFiles, referenceSessionId, categoryId, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Cosmetic Procedure — Base Properties</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Type</label>
            <input type="text" value={type} onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {/* Date — only for single-event entities */}
          {isSingleEvent && (
            <PartialDateInput
              dateValue={date}
              precisionValue={datePrecision}
              onDateChange={setDate}
              onPrecisionChange={setDatePrecision}
              label="Date"
            />
          )}

          {/* Body Region Picker */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Body Region</label>
            <BodyRegionCompact
              value={bodyRegions}
              onChange={setBodyRegions}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Provider</label>
            <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {attributeGroups && attributeGroups.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">Affects Attribute</label>
              <select
                value={attributeDefinitionId}
                onChange={(e) => setAttributeDefinitionId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None</option>
                {attributeGroups.map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {g.definitions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}{d.unit ? ` (${d.unit})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground/60">Link to a physical attribute to track natural/enhanced status.</p>
            </div>
          )}

          {/* Inline photo upload */}
          {referenceSessionId && categoryId && (
            <InlineUploadZone
              pendingFiles={pendingFiles}
              onPendingFilesChange={setPendingFiles}
              existingPhotos={existingPhotos?.map((p) => ({
                id: p.id,
                url: p.url,
                width: p.width,
                height: p.height,
              }))}
            />
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={isPending || !type.trim() || bodyRegions.length === 0}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Saving..." : "Update Cosmetic Procedure"}
          </button>
        </div>
      </div>
    </div>
  );
}
