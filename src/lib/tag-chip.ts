import type { TagChipData } from "@/lib/types/tag";

/**
 * The select for an entity's tag join rows (`personTags`, `setTags`, …) when
 * only chips are needed. The join tables are the only store of an entity's
 * tags (ADR-0033) — there is no copied name array any more.
 */
export const TAG_CHIP_JOIN_SELECT = {
  select: {
    tagDefinition: {
      select: {
        id: true as const,
        name: true as const,
        group: { select: { name: true as const, color: true as const } },
      },
    },
  },
  // Mutable array: Prisma's orderBy does not accept a readonly tuple
  orderBy: [
    { tagDefinition: { group: { sortOrder: "asc" as const } } },
    { tagDefinition: { sortOrder: "asc" as const } },
  ],
};

type TagChipJoinRow = {
  tagDefinition: { id: string; name: string; group: { name: string; color: string } };
};

export function toTagChips(rows: readonly TagChipJoinRow[]): TagChipData[] {
  return rows.map((r) => ({
    id: r.tagDefinition.id,
    name: r.tagDefinition.name,
    group: { name: r.tagDefinition.group.name, color: r.tagDefinition.group.color },
  }));
}
