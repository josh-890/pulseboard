import { MARK_BY_KEY } from "./media-marks";

// Every key the viewer answers to (2026-10-17), grouped like its toolbar. One
// list, so the toolbar tooltips and the `?` cheat sheet can't drift apart.

export type ShortcutId =
  | "prev"
  | "next"
  | "close"
  | "origin"
  | "outtake"
  | "favorite"
  | "iconic"
  | "collection"
  | "target"
  | "tag"
  | "arm"
  | "paint"
  | "unpaint"
  | "slots"
  | "category"
  | "acts"
  | "compare"
  | "cover"
  | "focal"
  | "filmstrip"
  | "info"
  | "help"
  | "copy"
  | "delete";

export type Shortcut = { id: ShortcutId; label: string; keys: string[] };

export const LIGHTBOX_SHORTCUT_GROUPS: { title: string; note?: string; items: Shortcut[] }[] = [
  {
    title: "Navigate",
    items: [
      { id: "prev", label: "Previous photo", keys: ["←"] },
      { id: "next", label: "Next photo", keys: ["→"] },
      { id: "close", label: "Close the viewer", keys: ["Esc"] },
      { id: "origin", label: "Back to its set (favorites, collections, tags)", keys: ["O"] },
    ],
  },
  {
    title: "Marks",
    note: "Tiers: a higher mark sets the lower ones, removing a lower one removes those above it.",
    items: [
      { id: "outtake", label: "Outtake", keys: [MARK_BY_KEY.outtake.hotkey] },
      { id: "favorite", label: "Favorite", keys: [MARK_BY_KEY.favorite.hotkey] },
      { id: "iconic", label: "Iconic", keys: [MARK_BY_KEY.iconic.hotkey] },
    ],
  },
  {
    title: "Organize",
    items: [
      { id: "collection", label: "Add to a collection", keys: ["B"] },
      { id: "target", label: "Add to the target collection", keys: ["G"] },
      { id: "tag", label: "Tag this photo", keys: ["T"] },
      { id: "arm", label: "Arm a tag to paint with", keys: ["⇧T"] },
      { id: "paint", label: "Paint the armed tag on", keys: ["P"] },
      { id: "unpaint", label: "Take the armed tag off", keys: ["⇧P"] },
      { id: "slots", label: "Toggle a quick-tag slot", keys: ["1", "…", "9"] },
      { id: "category", label: "Assign to a detail category", keys: ["D"] },
      { id: "acts", label: "Evidence for an act (sessions with intensity)", keys: ["A"] },
      { id: "compare", label: "Compare tray — add / remove", keys: ["X"] },
      { id: "cover", label: "Set as cover", keys: ["#"] },
    ],
  },
  {
    title: "View",
    items: [
      { id: "focal", label: "Focal point overlay", keys: ["F"] },
      { id: "filmstrip", label: "Filmstrip", keys: ["S"] },
      { id: "info", label: "Info panel", keys: ["I"] },
      { id: "help", label: "These shortcuts", keys: ["?"] },
    ],
  },
  {
    title: "More",
    items: [
      { id: "copy", label: "Copy to reference session", keys: ["C"] },
      { id: "delete", label: "Delete (asks first)", keys: ["Del"] },
    ],
  },
];

export const SHORTCUT_KEYS = Object.fromEntries(
  LIGHTBOX_SHORTCUT_GROUPS.flatMap((g) => g.items).map((s) => [s.id, s.keys]),
) as Record<ShortcutId, string[]>;

/** The keys as one label, e.g. "⇧T" or "1…9" */
export function shortcutLabel(id: ShortcutId): string {
  return SHORTCUT_KEYS[id].join("");
}
