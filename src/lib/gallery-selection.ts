/**
 * Range selection for image grids, Gmail / Google Photos style.
 *
 * Shift+click extends from the anchor — the last image clicked without Shift —
 * to the clicked image, in the order the grid shows them, and gives the whole
 * range the anchor's state: if the anchor click selected, the range is selected;
 * if it deselected, the range is deselected. That makes clearing a run of fifty
 * images as cheap as selecting it.
 */

export type SelectionAnchor = { id: string; selected: boolean };

export function applyRange(
  selected: ReadonlySet<string>,
  order: readonly string[],
  anchor: SelectionAnchor,
  targetId: string,
): Set<string> {
  const next = new Set(selected);
  const from = order.indexOf(anchor.id);
  const to = order.indexOf(targetId);
  if (to === -1) return next;
  // An anchor that has scrolled out of the visible order (a filter changed) is
  // no anchor: treat the click as a single one with the anchor's state.
  const [start, end] = from === -1 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
  for (let i = start; i <= end; i++) {
    if (anchor.selected) next.add(order[i]);
    else next.delete(order[i]);
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function invertWithin(selected: ReadonlySet<string>, order: readonly string[]): Set<string> {
  return new Set(order.filter((id) => !selected.has(id)));
}

/** Keep only what is still visible, so a bulk action never reaches a hidden image. */
export function pruneTo(selected: ReadonlySet<string>, order: readonly string[]): Set<string> {
  const visible = new Set(order);
  return new Set([...selected].filter((id) => visible.has(id)));
}

/** "all" / "some" / "none" of `ids` selected — drives a group's tri-state checkbox. */
export function groupSelectionState(
  selected: ReadonlySet<string>,
  ids: readonly string[],
): "all" | "some" | "none" {
  let n = 0;
  for (const id of ids) if (selected.has(id)) n++;
  if (n === 0) return "none";
  return n === ids.length ? "all" : "some";
}
