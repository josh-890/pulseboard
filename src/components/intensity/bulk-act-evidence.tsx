"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { GalleryItem } from "@/lib/types";
import { PhotoActPicker } from "./photo-act-picker";
import type { PhotoIntensity } from "./use-photo-intensity";

export type BulkActEvidenceProps = {
  intensity: PhotoIntensity;
  /** The selected photos */
  items: GalleryItem[];
};

// "Act…" in a gallery's selection bar (ADR-0036; 2026-11-28): the picker for
// the selected photos — an act picked is ticked for the chosen people where
// missing, and every selected photo they are on is linked; again unlinks.
export function BulkActEvidence({ intensity, items }: BulkActEvidenceProps) {
  const [open, setOpen] = useState(false);
  const n = items.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={n === 0}>
          <Gauge size={14} aria-hidden="true" />
          Act…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
          Rate an act on {n} selected photo{n === 1 ? "" : "s"}
        </p>
        {open && <PhotoActPicker intensity={intensity} items={items} />}
      </PopoverContent>
    </Popover>
  );
}
