"use client";

import { ChevronDown, Crosshair, Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArmedTagChip } from "@/components/tags/armed-tag-chip";
import { TagSlotBar, type SlotState } from "@/components/tags/tag-slot-bar";
import type { PaletteTag } from "@/lib/services/tag-service";
import { cn } from "@/lib/utils";
import { LightboxToolbarButton } from "./lightbox-toolbar-button";

// Tag + the painter in one pill (2026-10-17), the same way Shuffle is a segment
// of the showcase's Random pill: the left half opens the tag palette (T), the
// right half shows the armed tag (P) and opens the quick-tag slots 1–9.

export type LightboxTagPillProps = {
  armedTag: PaletteTag | null;
  onOpenTags: () => void;
  onArmRequest: () => void;
  onApplySlot: (tag: PaletteTag) => void;
  slotStateOf: (tagId: string) => SlotState;
  slotsOpen: boolean;
  onSlotsOpenChange: (open: boolean) => void;
};

export function LightboxTagPill({
  armedTag,
  onOpenTags,
  onArmRequest,
  onApplySlot,
  slotStateOf,
  slotsOpen,
  onSlotsOpenChange,
}: LightboxTagPillProps) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-white/10">
      <LightboxToolbarButton label="Tag this photo" shortcut="tag" onClick={onOpenTags}>
        <Tag size={16} />
      </LightboxToolbarButton>
      <Popover open={slotsOpen} onOpenChange={onSlotsOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={armedTag ? `Painter: ${armedTag.name} armed — slots and painter` : "Slots and painter — nothing armed"}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-r-full border-l border-white/15 pr-2 pl-1.5 text-xs transition-colors duration-150 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  armedTag ? "text-white/90" : "text-white/40",
                  slotsOpen && "bg-white/15 text-white",
                )}
              >
                <kbd className="font-mono text-[10px]">P</kbd>
                {armedTag && (
                  <>
                    <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ backgroundColor: armedTag.group.color }} aria-hidden="true" />
                    <span className="hidden max-w-[7rem] truncate lg:inline">{armedTag.name}</span>
                  </>
                )}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} className="dark">
            {armedTag ? `P paints ${armedTag.name} on, ⇧P takes it off` : "Nothing armed — ⇧T arms a tag"}
            <span className="block opacity-70">Quick-tag slots 1–9</span>
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="center"
          sideOffset={8}
          className="dark w-[22rem] space-y-3"
          // Esc closes the slots only — it must not travel on and close the viewer
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Crosshair size={12} aria-hidden="true" /> Painter
            </span>
            <ArmedTagChip entityType="MEDIA_ITEM" onArmRequest={onArmRequest} />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Quick-tag slots — click or press 1–9</span>
            <TagSlotBar entityType="MEDIA_ITEM" onApplySlot={onApplySlot} stateOf={slotStateOf} />
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
