import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// The disclosure matrix (ADR-0035): situations (columns, ordered by sortOrder),
// each with its own ladder of levels (ordered by rank), plus the settings an
// entry can carry. Ranks are kept dense (0..n-1) so a ladder's length is its
// level count.

export async function getDisclosureMatrix() {
  const [situations, settings] = await Promise.all([
    prisma.disclosureSituation.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        levels: {
          orderBy: { rank: "asc" },
          include: { _count: { select: { entries: true } } },
        },
      },
    }),
    prisma.disclosureSetting.findMany({
      orderBy: { rank: "asc" },
      include: { _count: { select: { entries: true } } },
    }),
  ]);
  return { situations, settings };
}

export type DisclosureMatrix = Awaited<ReturnType<typeof getDisclosureMatrix>>;

/** True when at least one situation has a level — before that the matrix is unused */
export async function hasDisclosureMatrix(): Promise<boolean> {
  return (await prisma.disclosureLevel.count()) > 0;
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error("Name is required.");
  return n;
}

// ─── Situations ──────────────────────────────────────────────────────────────

export async function createDisclosureSituation(name: string) {
  const max = await prisma.disclosureSituation.aggregate({ _max: { sortOrder: true } });
  return prisma.disclosureSituation.create({
    data: { name: cleanName(name), sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
}

export async function updateDisclosureSituation(id: string, data: { name?: string; weight?: number }) {
  if (data.weight !== undefined && (!Number.isFinite(data.weight) || data.weight < 0)) {
    throw new Error("Weight must be 0 or more.");
  }
  return prisma.disclosureSituation.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: cleanName(data.name) }),
      ...(data.weight !== undefined && { weight: data.weight }),
    },
  });
}

export async function deleteDisclosureSituation(id: string) {
  const used = await prisma.disclosureEntry.count({ where: { level: { situationId: id } } });
  if (used > 0) throw new Error(`Its levels are used by ${used} ${used === 1 ? "entry" : "entries"}.`);
  await prisma.disclosureSituation.delete({ where: { id } });
}

/** Moves a situation one place left (-1) or right (+1) */
export async function moveDisclosureSituation(id: string, direction: -1 | 1) {
  await prisma.$transaction(async (tx) => {
    const all = await tx.disclosureSituation.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
    const i = all.findIndex((s) => s.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [sortOrder, s] of all.entries()) {
      await tx.disclosureSituation.update({ where: { id: s.id }, data: { sortOrder } });
    }
  });
}

// ─── Levels ──────────────────────────────────────────────────────────────────

export async function createDisclosureLevel(situationId: string, name: string, description?: string | null) {
  const count = await prisma.disclosureLevel.count({ where: { situationId } });
  return prisma.disclosureLevel.create({
    data: { situationId, name: cleanName(name), description: description?.trim() || null, rank: count },
  });
}

export async function updateDisclosureLevel(id: string, data: { name?: string; description?: string | null }) {
  return prisma.disclosureLevel.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: cleanName(data.name) }),
      ...(data.description !== undefined && { description: data.description?.trim() || null }),
    },
  });
}

async function renumberLevels(tx: Prisma.TransactionClient, ids: string[]) {
  for (const [rank, id] of ids.entries()) {
    await tx.disclosureLevel.update({ where: { id }, data: { rank } });
  }
}

export async function deleteDisclosureLevel(id: string) {
  const used = await prisma.disclosureEntry.count({ where: { levelId: id } });
  if (used > 0) throw new Error(`Used by ${used} ${used === 1 ? "entry" : "entries"}.`);
  await prisma.$transaction(async (tx) => {
    const level = await tx.disclosureLevel.delete({ where: { id } });
    const rest = await tx.disclosureLevel.findMany({
      where: { situationId: level.situationId },
      orderBy: { rank: "asc" },
      select: { id: true },
    });
    await renumberLevels(tx, rest.map((l) => l.id));
  });
}

/** Moves a level one step down the ladder (-1, lower) or up (+1, higher) */
export async function moveDisclosureLevel(id: string, direction: -1 | 1) {
  await prisma.$transaction(async (tx) => {
    const level = await tx.disclosureLevel.findUniqueOrThrow({ where: { id }, select: { situationId: true } });
    const ladder = await tx.disclosureLevel.findMany({
      where: { situationId: level.situationId },
      orderBy: { rank: "asc" },
      select: { id: true },
    });
    const i = ladder.findIndex((l) => l.id === id);
    const j = i + direction;
    if (j < 0 || j >= ladder.length) return;
    [ladder[i], ladder[j]] = [ladder[j], ladder[i]];
    await renumberLevels(tx, ladder.map((l) => l.id));
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function createDisclosureSetting(name: string) {
  const count = await prisma.disclosureSetting.count();
  return prisma.disclosureSetting.create({ data: { name: cleanName(name), rank: count } });
}

export async function updateDisclosureSetting(id: string, name: string) {
  return prisma.disclosureSetting.update({ where: { id }, data: { name: cleanName(name) } });
}

export async function deleteDisclosureSetting(id: string) {
  const used = await prisma.disclosureEntry.count({ where: { settingId: id } });
  if (used > 0) throw new Error(`Used by ${used} ${used === 1 ? "entry" : "entries"}.`);
  await prisma.$transaction(async (tx) => {
    await tx.disclosureSetting.delete({ where: { id } });
    const rest = await tx.disclosureSetting.findMany({ orderBy: { rank: "asc" }, select: { id: true } });
    for (const [rank, s] of rest.entries()) await tx.disclosureSetting.update({ where: { id: s.id }, data: { rank } });
  });
}

export async function moveDisclosureSetting(id: string, direction: -1 | 1) {
  await prisma.$transaction(async (tx) => {
    const all = await tx.disclosureSetting.findMany({ orderBy: { rank: "asc" }, select: { id: true } });
    const i = all.findIndex((s) => s.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [rank, s] of all.entries()) await tx.disclosureSetting.update({ where: { id: s.id }, data: { rank } });
  });
}
