"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMarkTags } from "@/hooks/use-mark-tags";
import { setMediaFavoriteAction } from "@/lib/actions/media-actions";
import { addTagsToEntityAction, removeTagsFromEntityAction } from "@/lib/actions/tag-actions";
import type { GalleryItem } from "@/lib/types";
import { MARKS, itemMarks, type MarkKey } from "./media-marks";

// The marks on a grid tile (2026-10-16): iconic, ★ and outtake as small badges
// stacked down the right edge (narrow tiles have no room across), always visible
// when set. Hovering the tile turns them into buttons — the unset
// ones appear as outlines — so a click marks the photo without opening it. On
// touch screens (no hover) and while selecting several, they only show.

export type GalleryTileMarksProps = {
  item: Pick<GalleryItem, "id" | "isFavorite" | "tags">;
  /** Click to toggle; otherwise badges only */
  interactive: boolean;
  /** Hide the ★ badge (the favorites page, where every photo is one) */
  showFavorite: boolean;
  className?: string;
};

export function GalleryTileMarks({ item, interactive, showFavorite, className }: GalleryTileMarksProps) {
  const markTags = useMarkTags();
  const [override, setOverride] = useState<Partial<Record<MarkKey, boolean>>>({});
  const [, startTransition] = useTransition();
  const known = itemMarks(item, markTags);

  function toggle(key: MarkKey, next: boolean) {
    setOverride((o) => ({ ...o, [key]: next }));
    startTransition(async () => {
      const res =
        key === "favorite"
          ? await setMediaFavoriteAction(item.id, next)
          : await (next ? addTagsToEntityAction : removeTagsFromEntityAction)("MEDIA_ITEM", item.id, [markTags![key].id]);
      if (!res.success) {
        setOverride((o) => ({ ...o, [key]: !next }));
        toast.error(res.error ?? "Could not change the mark");
      }
    });
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {MARKS.map((mark) => {
        if (mark.key === "favorite" && !showFavorite) return null;
        const state = override[mark.key] ?? known[mark.key];
        if (state === null) return null; // tags not loaded for this gallery
        const canToggle = interactive && (mark.key === "favorite" || markTags !== null);
        if (!state && !canToggle) return null;
        const label = `${mark.label} (${state ? "set" : "not set"})`;
        const badge = cn(
          "flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-[opacity,background-color] duration-150",
          state ? mark.activeClass : cn("bg-black/55 backdrop-blur-sm", mark.idleClass),
        );
        const icon = <mark.Icon size={10} fill={state ? "currentColor" : "none"} strokeWidth={2.5} />;
        if (!canToggle) {
          return (
            <span key={mark.key} className={cn(badge, "pointer-events-none")} aria-label={mark.label}>
              {icon}
            </span>
          );
        }
        return (
          <button
            key={mark.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(mark.key, !state);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-pressed={!!state}
            aria-label={label}
            title={`${mark.label}${state ? " — click to remove" : ""}`}
            className={cn(
              badge,
              "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
              // Unset marks only while the tile is hovered or focused — taking no
              // room otherwise, so a set mark sits in the corner
              !state && "hidden group-hover:flex group-focus-within:flex",
              // No hover on touch: badges only, so a tap opens the photo instead
              "[@media(hover:none)]:pointer-events-none",
              !state && "[@media(hover:none)]:hidden",
            )}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
