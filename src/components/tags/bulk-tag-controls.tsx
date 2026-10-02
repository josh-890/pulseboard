"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hash, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useArmedTag } from "@/hooks/use-armed-tag";
import { useBulkTagging, type BulkTagChange } from "@/hooks/use-bulk-tagging";
import { useTagHotkeys } from "@/hooks/use-tag-hotkeys";
import { useTagSlots } from "@/hooks/use-tag-slots";
import type { PaletteTag } from "@/lib/services/tag-service";
import { tagFitsEntity, type TaggableEntity } from "@/lib/tag-domains";
import { ArmedTagChip } from "./armed-tag-chip";
import { TagPalette } from "./tag-palette";
import { TagSlotBar, type SlotState } from "./tag-slot-bar";

export type BulkTagControlsProps = {
  entityType: TaggableEntity;
  entityIds: string[];
  /** Called after each add/remove so the caller can update its tiles */
  onApplied?: (change: BulkTagChange) => void;
  /** Keys 1–9, T, Shift+T, P act on the selection (off while something else owns the keyboard) */
  hotkeysEnabled?: boolean;
};

// Selection-bar tagging (ADR-0033, S3): the tri-state palette (T), quick-tag
// slots (1–9), and the armed tag (Shift+T to arm, P / Shift+P to paint) — all
// acting on the whole selection. "All have it" removes, anything less adds.
export function BulkTagControls({ entityType, entityIds, onApplied, hotkeysEnabled = true }: BulkTagControlsProps) {
  const bulk = useBulkTagging(entityType, entityIds, onApplied);
  const { loadCounts, counts, apply } = bulk;
  const slots = useTagSlots();
  const { armed, arm } = useArmedTag();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [armOpen, setArmOpen] = useState(false);

  // Re-read the selection's tags whenever it changes (debounced: shift-ranges fire fast)
  const selectionKey = useMemo(() => entityIds.join(","), [entityIds]);
  useEffect(() => {
    if (!selectionKey) return;
    const t = setTimeout(loadCounts, 250);
    return () => clearTimeout(t);
  }, [selectionKey, loadCounts]);

  const stateOf = useCallback(
    (tagId: string): SlotState => {
      const n = counts?.[tagId] ?? 0;
      return n === 0 ? "none" : n >= entityIds.length ? "all" : "some";
    },
    [counts, entityIds.length],
  );

  const applyIfFits = useCallback(
    (tag: PaletteTag, on: boolean) => {
      if (!tagFitsEntity(tag.group.domain, entityType)) {
        toast.message(`${tag.name} cannot be applied here`);
        return;
      }
      apply(tag, on);
    },
    [apply, entityType],
  );

  useTagHotkeys(hotkeysEnabled && entityIds.length > 0, {
    onSlot: (pos) => {
      const tag = slots.slotTag(pos);
      if (tag) applyIfFits(tag, stateOf(tag.id) !== "all");
      else toast.message(`Slot ${pos} is empty`);
    },
    onPalette: () => setPaletteOpen(true),
    onArm: () => setArmOpen(true),
    onPaint: (remove) => {
      if (!armed) {
        toast.message("No tag armed — Shift+T to arm one");
        return;
      }
      applyIfFits(armed, !remove);
    },
  });

  if (entityIds.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPaletteOpen(true)} title="Tag the selection (T)">
        <Tag size={14} />
        Tags
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" title="Quick-tag slots (1–9)">
            <Hash size={14} />
            Slots
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem]" align="start">
          <TagSlotBar entityType={entityType} onApplySlot={(tag) => applyIfFits(tag, stateOf(tag.id) !== "all")} stateOf={stateOf} />
        </PopoverContent>
      </Popover>
      <ArmedTagChip entityType={entityType} onArmRequest={() => setArmOpen(true)} />

      <TagPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        entityType={entityType}
        selectionCounts={counts ?? {}}
        selectionSize={entityIds.length}
        onToggle={applyIfFits}
      />
      <TagPalette
        open={armOpen}
        onOpenChange={setArmOpen}
        entityType={entityType}
        title="Arm a tag to paint with P"
        onPick={arm}
      />
    </>
  );
}
