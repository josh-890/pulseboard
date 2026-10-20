"use client";

import { memo } from "react";
import Link from "next/link";
import { Camera, ExternalLink, Film, ImageOff } from "lucide-react";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import type { SessionPhotoGroup } from "@/lib/session-merge-groups";
import { plural } from "@/lib/session-merge-text";
import type { GalleryItem, SessionMergeCard } from "@/lib/types";
import { cn, formatPartialDateISO } from "@/lib/utils";
import { MergeRoleBadge } from "../merge-role-badge";
import { MergePinButton } from "./merge-pin-button";

// One session on the compare page (2026-10-20): its photos set by set, each
// opens the lightbox; the pin button puts a photo into the 2-up loupe, one per side.
// A session can hold 400 photos, so a set's grid redraws only when its photos
// change (the person filter) — a pin redraws just the pin buttons — and rows out
// of view skip layout and paint.

/** `onOpen` must keep its identity, or every grid redraws on each render */
const SetGroupGrid = memo(function SetGroupGrid({
  photos,
  side,
  onOpen,
}: {
  photos: GalleryItem[];
  side: "stays" | "goes";
  onOpen: (photoId: string) => void;
}) {
  return (
    <JustifiedGrid
      items={photos}
      onOpen={onOpen}
      markControls={false}
      deferOffscreenRows
      tileAction={(item) => <MergePinButton side={side} photoId={item.id} />}
    />
  );
});

export type MergeSessionColumnProps = {
  role: "stays" | "goes";
  card: SessionMergeCard;
  groups: SessionPhotoGroup[];
  onOpen: (photoId: string) => void;
  filtered: boolean;
  className?: string;
};

export function MergeSessionColumn({ role, card, groups, onOpen, filtered, className }: MergeSessionColumnProps) {
  const shown = groups.reduce((n, g) => n + g.photos.length, 0);
  return (
    <section
      aria-label={role === "stays" ? `Stays: ${card.name}` : `Merged in: ${card.name}`}
      data-merge-role={role === "stays" ? "survivor" : "absorbed"}
      className={cn(
        "min-w-0 rounded-xl border p-3",
        role === "stays" ? "border-emerald-600/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5",
        className,
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold" title={card.name}>
            {card.name}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {[formatPartialDateISO(card.date, card.datePrecision) || "No date", card.labelName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MergeRoleBadge role={role} />
          <Link
            href={`/sessions/${card.id}`}
            target="_blank"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${card.name} in a new tab`}
            title="Open in a new tab"
          >
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {card.mediaCount === 0 ? (
        <p className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border p-6 text-xs text-muted-foreground">
          <ImageOff size={14} aria-hidden="true" /> No photos in this session
        </p>
      ) : filtered && shown === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No photo here shows this person.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const TypeIcon = g.set?.type === "video" ? Film : Camera;
            return (
              <div key={g.key} data-set-group={g.key}>
                <div className="mb-1.5 flex min-w-0 items-center gap-2">
                  <div className="flex h-10 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {g.set?.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.set.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <TypeIcon size={12} aria-hidden="true" className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-medium" title={g.set?.title ?? "Not in a set"}>
                      {g.set ? (
                        <Link href={`/sets/${g.set.id}`} target="_blank" className="hover:underline">
                          {g.set.title}
                        </Link>
                      ) : (
                        "Not in a set"
                      )}
                    </h3>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[g.set?.channelName, g.set && formatPartialDateISO(g.set.releaseDate, g.set.releaseDatePrecision), plural(g.photos.length, "photo", "photos")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                {g.photos.length === 0 ? (
                  <p className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                    {filtered ? "None with this person" : "No photos"}
                  </p>
                ) : (
                  <SetGroupGrid photos={g.photos} side={role} onOpen={onOpen} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
