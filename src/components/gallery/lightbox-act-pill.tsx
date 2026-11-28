"use client";

import { Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PhotoActPicker } from "@/components/intensity/photo-act-picker";
import type { PhotoIntensity } from "@/components/intensity/use-photo-intensity";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shortcutLabel } from "./lightbox-shortcuts";

export type LightboxActPillProps = {
  intensity: PhotoIntensity;
  item: GalleryItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
};

// Acts in the viewer (ADR-0036; 2026-11-28): the count of acts this photo is
// evidence for, and behind it (A) the picker — an act picked is ticked for the
// chosen people and the photo linked, in one step.
export function LightboxActPill({ intensity, item, open, onOpenChange, onPrev, onNext }: LightboxActPillProps) {
  const linked = intensity.linkedOn(item);
  const names = linked.map((l) => `${l.act.name} — ${l.lead.label}`);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={linked.length ? `Evidence for ${linked.length} act${linked.length === 1 ? "" : "s"} — rate an act` : "Rate an act on this photo"}
              aria-keyshortcuts={shortcutLabel("acts")}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 text-xs transition-colors duration-150 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                linked.length ? "text-white" : "text-white/70",
                open && "bg-white/15 text-white",
              )}
            >
              <Gauge size={16} aria-hidden="true" />
              {linked.length > 0 && <span className="tabular-nums">{linked.length}</span>}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="dark">
          <span className="flex items-center gap-2">
            Rate an act on this photo
            <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] leading-4 opacity-80">{shortcutLabel("acts")}</kbd>
          </span>
          {names.length > 0 && <span className="block opacity-70">{names.join(" · ")}</span>}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="dark w-96 p-2"
        // Esc closes the picker only — it must not travel on and close the viewer
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <PhotoActPicker intensity={intensity} items={[item]} dark onPrev={onPrev} onNext={onNext} />
      </PopoverContent>
    </Popover>
  );
}
