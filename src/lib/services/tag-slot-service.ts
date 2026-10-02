import { prisma } from "@/lib/db";
import type { TagDefinitionWithGroup } from "./tag-service";

// Quick-tag slot sets (ADR-0033, S3): named sets of up to nine tags bound to
// the keys 1–9 — Lightroom's keyword sets. One set is active; switching sets
// swaps what the digits do. A set may hold tags of any domain: the bar only
// enables the slots whose tag fits the item being tagged.

export const SLOT_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SlotSetWithSlots = {
  id: string;
  name: string;
  isActive: boolean;
  slots: { position: number; tag: TagDefinitionWithGroup }[];
};

const TAG_INCLUDE = {
  group: {
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      isExclusive: true,
      domain: true,
      typicalLevel: true,
      kind: true,
    },
  },
  aliases: { select: { name: true } },
} as const;

/** All slot sets, the active one guaranteed to exist (a first "Default" is created). */
export async function getSlotSets(): Promise<SlotSetWithSlots[]> {
  const count = await prisma.tagSlotSet.count();
  if (count === 0) {
    await prisma.tagSlotSet.create({ data: { name: "Default", isActive: true } });
  } else if ((await prisma.tagSlotSet.count({ where: { isActive: true } })) === 0) {
    const first = await prisma.tagSlotSet.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });
    await prisma.tagSlotSet.update({ where: { id: first.id }, data: { isActive: true } });
  }
  const sets = await prisma.tagSlotSet.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      slots: {
        orderBy: { position: "asc" },
        include: { tagDefinition: { include: TAG_INCLUDE } },
      },
    },
  });
  return sets.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    slots: s.slots.map((sl) => ({ position: sl.position, tag: sl.tagDefinition })),
  }));
}

export async function setActiveSlotSet(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.tagSlotSet.updateMany({ where: { isActive: true, NOT: { id } }, data: { isActive: false } }),
    prisma.tagSlotSet.update({ where: { id }, data: { isActive: true } }),
  ]);
}

/** A new set becomes the active one, so it can be filled right away. */
export async function createSlotSet(name: string): Promise<string> {
  const max = await prisma.tagSlotSet.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.tagSlotSet.create({
    data: { name: name.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  await setActiveSlotSet(created.id);
  return created.id;
}

export async function renameSlotSet(id: string, name: string): Promise<void> {
  await prisma.tagSlotSet.update({ where: { id }, data: { name: name.trim() } });
}

/** Deleting the active set hands "active" to the first remaining one. */
export async function deleteSlotSet(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const doomed = await tx.tagSlotSet.delete({ where: { id } });
    if (doomed.isActive) {
      const next = await tx.tagSlotSet.findFirst({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
      if (next) await tx.tagSlotSet.update({ where: { id: next.id }, data: { isActive: true } });
    }
  });
}

/** Put a tag in a slot (1–9), or clear the slot with `tagDefinitionId = null`. */
export async function setSlot(slotSetId: string, position: number, tagDefinitionId: string | null): Promise<void> {
  if (!SLOT_POSITIONS.includes(position as (typeof SLOT_POSITIONS)[number])) {
    throw new Error("Slot position must be 1–9");
  }
  if (tagDefinitionId === null) {
    await prisma.tagSlot.deleteMany({ where: { slotSetId, position } });
    return;
  }
  await prisma.tagSlot.upsert({
    where: { slotSetId_position: { slotSetId, position } },
    create: { slotSetId, position, tagDefinitionId },
    update: { tagDefinitionId },
  });
}
