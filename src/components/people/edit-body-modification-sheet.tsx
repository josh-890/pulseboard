"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BodyRegionCompact } from "@/components/shared/body-region-picker";
import { getRegionLabel } from "@/lib/constants/body-regions";
import type { BodyModificationType, BodyModificationStatus } from "@/generated/prisma/client";
import type { BodyModificationWithEvents } from "@/lib/types";
import {
  BODY_MODIFICATION_TYPES, BODY_MODIFICATION_TYPE_STYLES,
  BODY_MODIFICATION_STATUSES, BODY_MODIFICATION_STATUS_STYLES,
} from "@/lib/constants/body";
import { updateBodyModificationAction } from "@/lib/actions/appearance-actions";

type EditBodyModificationSheetProps = {
  personId: string;
  modification: BodyModificationWithEvents;
  onClose: () => void;
};

export function EditBodyModificationSheet({ personId, modification, onClose }: EditBodyModificationSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<BodyModificationType>(modification.type);
  const [bodyRegions, setBodyRegions] = useState<string[]>(
    modification.bodyRegions.length > 0 ? modification.bodyRegions : [],
  );
  const [description, setDescription] = useState(modification.description ?? "");
  const [material, setMaterial] = useState(modification.material ?? "");
  const [gauge, setGauge] = useState(modification.gauge ?? "");
  const [status, setStatus] = useState<BodyModificationStatus>(modification.status);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (bodyRegions.length === 0) {
      setError("At least one body region is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const primaryRegion = bodyRegions[0];
      const result = await updateBodyModificationAction(modification.id, personId, {
        type,
        bodyRegion: getRegionLabel(primaryRegion),
        bodyRegions,
        description: description.trim() || undefined,
        material: material.trim() || undefined,
        gauge: gauge.trim() || undefined,
        status,
      });
      if (!result.success) { setError(result.error ?? "Failed to update."); return; }
      onClose();
    });
  }, [modification.id, personId, type, bodyRegions, description, material, gauge, status, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Body Modification</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Type</label>
            <div className="flex flex-wrap gap-2">
              {BODY_MODIFICATION_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all",
                    type === t ? BODY_MODIFICATION_TYPE_STYLES[t] : "border-white/15 text-muted-foreground hover:border-white/30")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Status</label>
            <div className="flex flex-wrap gap-2">
              {BODY_MODIFICATION_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all",
                    status === s ? BODY_MODIFICATION_STATUS_STYLES[s] : "border-white/15 text-muted-foreground hover:border-white/30")}>
                  {s}
                </button>
              ))}
            </div>
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Material</label>
              <input type="text" value={material} onChange={(e) => setMaterial(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Gauge</label>
              <input type="text" value={gauge} onChange={(e) => setGauge(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={isPending || bodyRegions.length === 0}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {isPending ? "Saving..." : "Update Body Modification"}
          </button>
        </div>
      </div>
    </div>
  );
}
