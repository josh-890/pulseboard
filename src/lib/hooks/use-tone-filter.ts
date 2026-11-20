"use client";

import { useCallback, useMemo, useState } from "react";
import type { GalleryItem } from "@/lib/types";

/** The gallery's tone filter (ADR-0041): all, color only, or B&W only */
export type GalleryTone = "all" | "COLOR" | "MONO";

export type ToneTally = { all: number; COLOR: number; MONO: number };

/** How many of these are color, how many B&W (unmeasured count only in all) */
export function tallyTones(items: GalleryItem[]): ToneTally {
  const t: ToneTally = { all: items.length, COLOR: 0, MONO: 0 };
  for (const it of items) if (it.tone === "COLOR" || it.tone === "MONO") t[it.tone] += 1;
  return t;
}

/**
 * The tone filter state of a set or session gallery. It narrows the base list
 * (like the tag filter), so every view — flat, by set, by clip, people filter,
 * the viewer — shows the same photos. Offered only when both kinds are there;
 * while reordering it is off, so a drag never works on a partial list.
 */
export function useToneFilter(items: GalleryItem[], suspended = false) {
  const [tone, setToneState] = useState<GalleryTone>("all");
  // Photos re-marked while a tone is chosen stay in view until the choice changes,
  // so a correction never makes the photo you are looking at vanish
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set());
  const base = useMemo(() => tallyTones(items), [items]);
  const available = (base.COLOR > 0 && base.MONO > 0) || (tone !== "all" && kept.size > 0);
  const effective: GalleryTone = suspended || !available ? "all" : tone;
  const filtered = useMemo(
    () => (effective === "all" ? items : items.filter((it) => it.tone === effective || kept.has(it.id))),
    [items, effective, kept],
  );
  const setTone = useCallback((t: GalleryTone) => {
    setToneState(t);
    setKept(new Set());
  }, []);
  const keep = useCallback((ids: string[]) => setKept((prev) => new Set([...prev, ...ids])), []);
  return { tone: effective, setTone, available, items: filtered, keep };
}
