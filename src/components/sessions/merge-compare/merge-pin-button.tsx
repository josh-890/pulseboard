"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";

// The pinned photo of each side lives in a small store (2026-10-20): a pin
// redraws the two buttons whose state changed, not the hundreds of tiles — or
// buttons — around them.

type Side = "stays" | "goes";
export type MergePins = Record<Side, string | null>;

export type MergePinStore = {
  get: () => MergePins;
  set: (next: MergePins) => void;
  toggle: (side: Side, id: string) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createMergePinStore(): MergePinStore {
  let pins: MergePins = { stays: null, goes: null };
  const listeners = new Set<() => void>();
  const set = (next: MergePins) => {
    pins = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => pins,
    set,
    toggle: (side, id) => set({ ...pins, [side]: pins[side] === id ? null : id }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const MergePinContext = createContext<MergePinStore | null>(null);

/** The pins, re-rendering on every change — for the bar and the loupe */
export function useMergePins(store: MergePinStore): MergePins {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export type MergePinButtonProps = {
  side: Side;
  photoId: string;
};

export function MergePinButton({ side, photoId }: MergePinButtonProps) {
  const store = useContext(MergePinContext);
  if (!store) throw new Error("MergePinButton needs a MergePinContext");
  const isPinned = () => store.get()[side] === photoId;
  const pinned = useSyncExternalStore(store.subscribe, isPinned, isPinned);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        store.toggle(side, photoId);
      }}
      aria-pressed={pinned}
      aria-label={pinned ? "Pinned to compare" : "Pin to compare"}
      title={pinned ? "Pinned to compare — click to unpin" : "Pin to compare side by side"}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-white transition-opacity duration-150",
        "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pinned ? "bg-indigo-500 opacity-100" : "bg-black/55 opacity-0 hover:bg-black/75 group-hover:opacity-100",
      )}
    >
      <Columns2 size={12} aria-hidden="true" />
    </button>
  );
}
