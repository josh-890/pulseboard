"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createSlotSetAction,
  deleteSlotSetAction,
  renameSlotSetAction,
  setActiveSlotSetAction,
  setSlotAction,
} from "@/lib/actions/tag-actions";
import type { PaletteTag } from "@/lib/services/tag-service";
import type { SlotSetWithSlots } from "@/lib/services/tag-slot-service";

// Quick-tag slot sets (keys 1–9). Every bar on the page shares one copy: a
// module-level store refreshed from /api/tags/slots after each change.

let store: SlotSetWithSlots[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(sets: SlotSetWithSlots[]) => void>();

function publish(sets: SlotSetWithSlots[]) {
  store = sets;
  listeners.forEach((l) => l(sets));
}

function reload(): Promise<void> {
  if (!inflight) {
    inflight = fetch("/api/tags/slots")
      .then((r) => (r.ok ? (r.json() as Promise<SlotSetWithSlots[]>) : Promise.reject(new Error(String(r.status)))))
      .then((sets) => publish(sets))
      .catch(() => {
        toast.error("Could not load quick-tag slots");
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export type TagSlotsController = {
  sets: SlotSetWithSlots[];
  active: SlotSetWithSlots | null;
  /** The tag in slot `position` (1–9) of the active set */
  slotTag: (position: number) => PaletteTag | null;
  switchTo: (id: string) => void;
  assign: (position: number, tag: PaletteTag | null) => void;
  createSet: (name: string) => void;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;
};

export function useTagSlots(): TagSlotsController {
  const [sets, setSets] = useState<SlotSetWithSlots[]>(store ?? []);
  const [, startTransition] = useTransition();

  useEffect(() => {
    listeners.add(setSets);
    if (store === null) void reload();
    return () => {
      listeners.delete(setSets);
    };
  }, []);

  const active = sets.find((s) => s.isActive) ?? null;

  const slotTag = useCallback(
    (position: number): PaletteTag | null => {
      const slot = active?.slots.find((s) => s.position === position);
      return slot ? { ...slot.tag, usageCount: 0 } : null;
    },
    [active],
  );

  const run = useCallback((fn: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.success) toast.error(res.error ?? "Failed");
      await reload();
    });
  }, []);

  const switchTo = useCallback(
    (id: string) => {
      publish(sets.map((s) => ({ ...s, isActive: s.id === id })));
      run(() => setActiveSlotSetAction(id));
    },
    [sets, run],
  );

  const assign = useCallback(
    (position: number, tag: PaletteTag | null) => {
      if (!active) return;
      publish(
        sets.map((s) =>
          s.id !== active.id
            ? s
            : {
                ...s,
                slots: [
                  ...s.slots.filter((sl) => sl.position !== position),
                  ...(tag ? [{ position, tag }] : []),
                ].sort((a, b) => a.position - b.position),
              },
        ),
      );
      run(() => setSlotAction(active.id, position, tag?.id ?? null));
    },
    [active, sets, run],
  );

  const createSet = useCallback((name: string) => run(() => createSlotSetAction(name)), [run]);
  const renameSet = useCallback((id: string, name: string) => run(() => renameSlotSetAction(id, name)), [run]);
  const deleteSet = useCallback((id: string) => run(() => deleteSlotSetAction(id)), [run]);

  return { sets, active, slotTag, switchTo, assign, createSet, renameSet, deleteSet };
}
