"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { PaletteTag } from "@/lib/services/tag-service";

// The armed tag (ADR-0033 painter): one tag held ready so `P` applies it to
// the current image or selection without opening the palette. Per viewer —
// kept in localStorage and shared live between every component in the tab.

const KEY = "pulseboard:armed-tag";
const listeners = new Set<() => void>();
let cached: { raw: string | null; tag: PaletteTag | null } = { raw: null, tag: null };

function read(): PaletteTag | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cached.raw) return cached.tag;
  let tag: PaletteTag | null = null;
  try {
    tag = raw ? (JSON.parse(raw) as PaletteTag) : null;
  } catch {
    tag = null;
  }
  cached = { raw, tag };
  return tag;
}

function write(tag: PaletteTag | null) {
  try {
    if (tag) localStorage.setItem(KEY, JSON.stringify(tag));
    else localStorage.removeItem(KEY);
  } catch {
    // Convenience only — a blocked storage just means nothing stays armed
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useArmedTag(): { armed: PaletteTag | null; arm: (tag: PaletteTag) => void; disarm: () => void } {
  const armed = useSyncExternalStore(subscribe, read, () => null);
  const arm = useCallback((tag: PaletteTag) => write(tag), []);
  const disarm = useCallback(() => write(null), []);
  return { armed, arm, disarm };
}
