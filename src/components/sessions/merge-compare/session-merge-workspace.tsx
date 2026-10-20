"use client";

import { useMemo, useState } from "react";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { groupPhotosBySet, photosInShownOrder } from "@/lib/session-merge-groups";
import type { SessionMergeComparison } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MergeCompareLoupe } from "./merge-compare-loupe";
import { MergeConfirmBar } from "./merge-confirm-bar";
import { MergeFactsBar } from "./merge-facts-bar";
import { createMergePinStore, MergePinContext, useMergePins } from "./merge-pin-button";
import { MergeSessionColumn } from "./merge-session-column";

// The compare page (2026-10-20): two sessions in full before they become one.
// The older one stays and is on the left, wherever the merge was started. Seen
// side by side are the facts, every photo set by set, and — in the loupe — one
// pinned photo of each, zoomed together.

type Side = "stays" | "goes";

export type SessionMergeWorkspaceProps = {
  comparison: SessionMergeComparison;
};

export function SessionMergeWorkspace({ comparison }: SessionMergeWorkspaceProps) {
  const { survivor, absorbed, reason, sharedPersonIds } = comparison;
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [pinStore] = useState(createMergePinStore);
  const pins = useMergePins(pinStore);
  const [lightbox, setLightbox] = useState<{ side: Side; index: number } | null>(null);
  const [loupeOpen, setLoupeOpen] = useState(false);
  const [mobileSide, setMobileSide] = useState<Side>("stays");

  const sides = useMemo(() => {
    const build = (s: typeof survivor) => {
      const groups = groupPhotosBySet(s.card.sets, s.photos, personFilter);
      return { ...s, groups, ordered: photosInShownOrder(groups) };
    };
    return { stays: build(survivor), goes: build(absorbed) };
  }, [survivor, absorbed, personFilter]);

  const pinnedPhoto = (side: Side) => sides[side].photos.find((p) => p.id === pins[side]) ?? null;


  // Stable per side, so the set grids skip redrawing on a pin or the lightbox
  const open = useMemo(() => {
    const at = (side: Side) => (id: string) => {
      const index = sides[side].ordered.findIndex((p) => p.id === id);
      if (index >= 0) setLightbox({ side, index });
    };
    return { stays: at("stays"), goes: at("goes") };
  }, [sides]);

  // The loupe steps through what the columns show; a pinned photo outside the filter still counts
  const loupeList = (side: Side) => {
    const pinned = pinnedPhoto(side);
    const list = sides[side].ordered;
    return pinned && !list.some((p) => p.id === pinned.id) ? [pinned, ...list] : list;
  };

  return (
    <MergePinContext.Provider value={pinStore}>
    <div className="space-y-4">
      <MergeFactsBar
        survivor={survivor.card}
        absorbed={absorbed.card}
        reason={reason}
        sharedPersonIds={sharedPersonIds}
        personFilter={personFilter}
        onPersonFilter={setPersonFilter}
      />

      {/* Phone: one session at a time */}
      <div role="tablist" aria-label="Session" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden">
        {(["stays", "goes"] as const).map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={mobileSide === side}
            onClick={() => setMobileSide(side)}
            className={cn(
              "truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150",
              mobileSide === side ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {side === "stays" ? "Stays" : "Merged in"} · {sides[side].card.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["stays", "goes"] as const).map((side) => (
          <MergeSessionColumn
            key={side}
            role={side}
            card={sides[side].card}
            groups={sides[side].groups}
            onOpen={open[side]}
            filtered={!!personFilter}
            className={cn(
              "lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto",
              mobileSide !== side && "hidden lg:block",
            )}
          />
        ))}
      </div>

      <MergeConfirmBar
        survivor={survivor.card}
        absorbed={absorbed.card}
        pinned={{ stays: pinnedPhoto("stays"), goes: pinnedPhoto("goes") }}
        onUnpin={(side) => pinStore.set({ ...pinStore.get(), [side]: null })}
        onCompare={() => setLoupeOpen(true)}
      />

      {lightbox && (
        <GalleryLightbox
          items={sides[lightbox.side].ordered}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          sessionId={sides[lightbox.side].card.id}
        />
      )}

      {loupeOpen && pins.stays && pins.goes && (
        <MergeCompareLoupe
          left={{ photos: loupeList("stays"), id: pins.stays, name: survivor.card.name }}
          right={{ photos: loupeList("goes"), id: pins.goes, name: absorbed.card.name }}
          onChange={(side, id) => pinStore.set({ ...pinStore.get(), [side]: id })}
          onClose={() => setLoupeOpen(false)}
        />
      )}
    </div>
    </MergePinContext.Provider>
  );
}
