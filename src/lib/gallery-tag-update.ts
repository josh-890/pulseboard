import type { GalleryItem } from "@/lib/types";
import type { PaletteTag } from "@/lib/services/tag-service";

/**
 * Apply one bulk tag change to gallery tiles without a reload (ADR-0033 S3):
 * add the tag to the affected items — dropping another tag of the same
 * exclusive group, as the server does — or remove it.
 */
export function applyTagChangeToItems<T extends Pick<GalleryItem, "id" | "tags">>(
  items: T[],
  change: { tag: PaletteTag; on: boolean; entityIds: string[] },
): T[] {
  const ids = new Set(change.entityIds);
  const { tag, on } = change;
  return items.map((it) => {
    if (!ids.has(it.id)) return it;
    const cur = it.tags ?? [];
    if (!on) return { ...it, tags: cur.filter((t) => t.id !== tag.id) };
    if (cur.some((t) => t.id === tag.id)) return it;
    const kept = tag.group.isExclusive ? cur.filter((t) => t.group.name !== tag.group.name) : cur;
    return { ...it, tags: [...kept, { id: tag.id, name: tag.name, group: { name: tag.group.name, color: tag.group.color } }] };
  });
}
