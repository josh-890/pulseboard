"use client";

import { useCallback, useState, useTransition } from "react";
import { X } from "lucide-react";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { cn } from "@/lib/utils";
import type { BodyMarkType } from "@/generated/prisma/client";
import { BODY_MARK_TYPES, BODY_MARK_TYPE_STYLES } from "@/lib/constants/body";
import { createBodyMarkAction } from "@/lib/actions/appearance-actions";

type AddBodyMarkSheetProps = {
  personId: string;
  onClose: () => void;
};

export function AddBodyMarkSheet({ personId, onClose }: AddBodyMarkSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<BodyMarkType>("tattoo");
  const [bodyRegion, setBodyRegion] = useState("");
  const [side, setSide] = useState("");
  const [position, setPosition] = useState("");
  const [description, setDescription] = useState("");
  const [motif, setMotif] = useState("");
  const [colors, setColors] = useState("");
  const [size, setSize] = useState("");
  const [date, setDate] = useState("");
  const [datePrecision, setDatePrecision] = useState("UNKNOWN");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!bodyRegion.trim()) {
      setError("Body region is required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await createBodyMarkAction(personId, {
        type,
        bodyRegion: bodyRegion.trim(),
        side: side.trim() || undefined,
        position: position.trim() || undefined,
        description: description.trim() || undefined,
        motif: motif.trim() || undefined,
        colors: colors.trim() ? colors.split(",").map((c) => c.trim()) : [],
        size: size.trim() || undefined,
        date: date || null,
        datePrecision,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to create body mark.");
        return;
      }
      onClose();
    });
  }, [personId, type, bodyRegion, side, position, description, motif, colors, size, date, datePrecision, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">Add Body Mark</h2>
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
                    type === t
                      ? BODY_MARK_TYPE_STYLES[t]
                      : "border-white/15 text-muted-foreground hover:border-white/30",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body Region */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Body Region</label>
            <input
              type="text"
              value={bodyRegion}
              onChange={(e) => setBodyRegion(e.target.value)}
              placeholder="e.g. left arm, back, chest..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Side + Position */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Side</label>
              <input
                type="text"
                value={side}
                onChange={(e) => setSide(e.target.value)}
                placeholder="left, right..."
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Position</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="upper, lower..."
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Motif */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Motif</label>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Design or pattern name..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description..."
              rows={2}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Colors + Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Colors</label>
              <input
                type="text"
                value={colors}
                onChange={(e) => setColors(e.target.value)}
                placeholder="black, red..."
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-0.5 text-xs text-muted-foreground/60">Comma-separated</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Size</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="small, 5cm..."
                className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Date + Precision */}
          <div>
            <PartialDateInput
              dateValue={date}
              precisionValue={datePrecision}
              onDateChange={setDate}
              onPrecisionChange={setDatePrecision}
              label="When (for auto-persona)"
            />
            <p className="mt-1 text-xs text-muted-foreground/60">
              A persona will be auto-created or matched by date.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !bodyRegion.trim()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create Body Mark"}
          </button>
        </div>
      </div>
    </div>
  );
}
