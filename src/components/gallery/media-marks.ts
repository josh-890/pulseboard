import { Bookmark, Crown, Heart, type LucideIcon } from "lucide-react";
import type { MarkTags } from "@/lib/services/media-mark-service";
import type { GalleryItem } from "@/lib/types";
import type { MarkKey } from "@/lib/media-mark-tiers";

export { markCascade, type MarkKey } from "@/lib/media-mark-tiers";

// The three marks you set on a photo while browsing (2026-10-16): iconic (a tag),
// ★ favorite (MediaItem.isFavorite) and outtake (a tag). One definition, so the
// lightbox, tiles, bulk bar and the person showcase look and key the same.
// Keys sit side by side on a German keyboard: , . -
// They are tiers (2026-10-17): see media-mark-tiers.ts.

export type MarkDef = {
  key: MarkKey;
  label: string;
  Icon: LucideIcon;
  /** Shortcut in the lightbox */
  hotkey: string;
  /** Filled badge / active button */
  activeClass: string;
  /** Icon colour on a dark, unset button */
  idleClass: string;
};

export const MARKS: MarkDef[] = [
  {
    key: "iconic",
    label: "Iconic",
    Icon: Crown,
    hotkey: "-",
    activeClass: "bg-amber-400 text-amber-950",
    idleClass: "text-amber-200/80",
  },
  {
    key: "favorite",
    label: "Favorite",
    Icon: Heart,
    hotkey: ".",
    activeClass: "bg-red-500 text-white",
    idleClass: "text-red-200/80",
  },
  {
    key: "outtake",
    label: "Outtake",
    Icon: Bookmark,
    hotkey: ",",
    activeClass: "bg-violet-500 text-white",
    idleClass: "text-violet-200/80",
  },
];

export const MARK_BY_KEY = Object.fromEntries(MARKS.map((m) => [m.key, m])) as Record<MarkKey, MarkDef>;

/** Which marks a photo carries; iconic/outtake are null when its tags are not loaded */
export function itemMarks(
  item: Pick<GalleryItem, "isFavorite" | "tags">,
  markTags: MarkTags | null,
): Record<MarkKey, boolean | null> {
  const tagIds = item.tags ? new Set(item.tags.map((t) => t.id)) : null;
  const has = (key: "iconic" | "outtake") => (tagIds && markTags ? tagIds.has(markTags[key].id) : null);
  return { iconic: has("iconic"), favorite: item.isFavorite, outtake: has("outtake") };
}
