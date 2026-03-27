"use client";

import { useCallback, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";
import {
  InlineUploadZone,
  cleanupPendingFiles,
  uploadAndLinkFiles,
} from "@/components/shared/inline-upload-zone";
import type { PendingFile } from "@/components/shared/inline-upload-zone";
import { getRegionLabel } from "@/lib/constants/body-regions";
import type { BodyMarkType } from "@/generated/prisma/client";
import type { BodyMarkWithEvents } from "@/lib/types";
import { BODY_MARK_TYPES, BODY_MARK_TYPE_STYLES } from "@/lib/constants/body";
import { updateBodyMarkAction } from "@/lib/actions/appearance-actions";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";

type EditBodyMarkSheetProps = {
  personId: string;
  mark: BodyMarkWithEvents;
  referenceSessionId?: string;
  categoryId?: string;
  existingPhotos?: EntityMediaThumbnail[];
  onClose: () => void;
};

function formatDateForInput(date: Date | null, isBaseline?: boolean): string {
  if (isBaseline || !date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function EditBodyMarkSheet({ personId, mark, referenceSessionId, categoryId, existingPhotos, onClose }: EditBodyMarkSheetProps) {
  const [isPending, startTransition] = useTransition();
  useEscToClose(onClose);
  const [type, setType] = useState<BodyMarkType>(mark.type);
  const [bodyRegions, setBodyRegions] = useState<string[]>(
    mark.bodyRegions.length > 0 ? mark.bodyRegions : [],
  );
  const [description, setDescription] = useState(mark.description ?? "");
  const [motif, setMotif] = useState(mark.motif ?? "");
  const [colors, setColors] = useState(mark.colors.join(", "));
  const [size, setSize] = useState(mark.size ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  // Single-event convenience: show date inline only when entity has exactly 1 event
  const isSingleEvent = mark.events.length === 1;
  const initialEvent = mark.events[0];
  const initDate = isSingleEvent ? formatDateForInput(initialEvent?.persona.date ?? null, initialEvent?.persona.isBaseline) : "";
  const initPrec = isSingleEvent ? (initialEvent?.persona.isBaseline ? "UNKNOWN" : (initialEvent?.persona.datePrecision ?? "UNKNOWN")) : "UNKNOWN";
  const [date, setDate] = useState(initDate);
  const [datePrecision, setDatePrecision] = useState(initPrec);

  const handleSubmit = useCallback(() => {
    if (bodyRegions.length === 0) {
      setError("At least one body region is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const primaryRegion = bodyRegions[0];
      const result = await updateBodyMarkAction(mark.id, personId, {
        type,
        bodyRegion: getRegionLabel(primaryRegion),
        bodyRegions,
        description: description.trim() || undefined,
        motif: motif.trim() || undefined,
        colors: colors.trim() ? colors.split(",").map((c) => c.trim()) : [],
        size: size.trim() || undefined,
        ...(isSingleEvent ? { singleEventDate: date || null, singleEventDatePrecision: datePrecision } : {}),
      });
      if (!result.success) {
        setError(result.error ?? "Failed to update body mark.");
        return;
      }
      if (pendingFiles.length > 0 && referenceSessionId && categoryId) {
        await uploadAndLinkFiles(
          pendingFiles,
          referenceSessionId,
          personId,
          categoryId,
          "bodyMarkId",
          mark.id,
        );
        cleanupPendingFiles(pendingFiles);
      }
      onClose();
    });
  }, [mark.id, personId, type, bodyRegions, description, motif, colors, size, isSingleEvent, date, datePrecision, pendingFiles, referenceSessionId, categoryId, onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Body Mark — Base Properties</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Type</label>
            <div className="flex flex-wrap gap-2">
              {BODY_MARK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all",
                    type === t ? BODY_MARK_TYPE_STYLES[t] : "border-white/15 text-muted-foreground hover:border-white/30",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
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
              mode="multi"
            />
          </div>

          {/* Motif */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Motif</label>
            <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          {/* Colors + Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Colors</label>
              <input type="text" value={colors} onChange={(e) => setColors(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Size</label>
              <input type="text" value={size} onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

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

          <button type="button" onClick={handleSubmit} disabled={isPending || bodyRegions.length === 0}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Saving..." : "Update Body Mark"}
          </button>
        </div>
      </div>
    </div>
  );
}
