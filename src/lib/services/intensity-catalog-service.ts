import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { INTENSITY_MAX, isIntensityStep } from "@/lib/intensity";
import { renameInTagQuery, type CatalogRename } from "@/lib/tag-query";

// The intensity catalog (ADR-0036): scenarios (columns, ordered by sortOrder),
// each with its own acts carrying an intensity level; extras that add fixed
// points, optionally in groups (at most one per group), and Max, which sets 10.
// The scale says in the user's words what each value means.

export async function getIntensityCatalog() {
  const [scale, scenarios, groups, extras] = await Promise.all([
    prisma.intensityScaleStep.findMany({ orderBy: { value: "asc" }, select: { value: true, title: true, description: true } }),
    prisma.intensityScenario.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        acts: {
          orderBy: [{ level: "asc" }, { name: "asc" }],
          include: { _count: { select: { contributions: true } } },
        },
      },
    }),
    prisma.intensityExtraGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.intensityExtra.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { contributions: true, actOverrides: true } } },
    }),
  ]);
  return { scale, scenarios, groups, extras };
}

export type IntensityCatalog = Awaited<ReturnType<typeof getIntensityCatalog>>;

/** True when at least one act exists — before that the catalog is unused */
export async function hasIntensityCatalog(): Promise<boolean> {
  return (await prisma.intensityAct.count()) > 0;
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error("Name is required.");
  return n;
}

function checkStep(value: number, what: string) {
  if (!isIntensityStep(value)) throw new Error(`${what} must be 0 or more, in steps of 0.5.`);
}

/**
 * Saved filters and Smart Collections name acts and scenarios in their `tags=`
 * query; a rename rewrites them in the same transaction, so none goes empty.
 */
async function rewriteSavedQueries(tx: Prisma.TransactionClient, rename: CatalogRename) {
  const rows = await tx.savedFilter.findMany({ where: { params: { contains: "tags=" } }, select: { id: true, params: true } });
  for (const row of rows) {
    const params = new URLSearchParams(row.params);
    const text = params.get("tags");
    if (!text) continue;
    const next = renameInTagQuery(text, rename);
    if (next === text) continue;
    params.set("tags", next);
    await tx.savedFilter.update({ where: { id: row.id }, data: { params: params.toString() } });
  }
}

async function nextSortOrder(max: Promise<{ _max: { sortOrder: number | null } }>) {
  return ((await max)._max.sortOrder ?? -1) + 1;
}

// ─── Scale ───────────────────────────────────────────────────────────────────

/**
 * Names and describes what an intensity value means. Only the given field
 * changes; an empty text clears it, and a value with neither is removed.
 */
export async function updateIntensityScaleStep(value: number, data: { title?: string; description?: string }) {
  if (!isIntensityStep(value) || value > INTENSITY_MAX) throw new Error("Not a value on the scale.");
  const clean = (t: string | undefined) => (t === undefined ? undefined : t.trim() || null);
  const title = clean(data.title);
  const description = clean(data.description);
  await prisma.$transaction(async (tx) => {
    const step = await tx.intensityScaleStep.upsert({
      where: { value },
      create: { value, title: title ?? null, description: description ?? null },
      update: { ...(title !== undefined && { title }), ...(description !== undefined && { description }) },
    });
    if (!step.title && !step.description) await tx.intensityScaleStep.delete({ where: { value } });
  });
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export async function createIntensityScenario(name: string) {
  const sortOrder = await nextSortOrder(prisma.intensityScenario.aggregate({ _max: { sortOrder: true } }));
  return prisma.intensityScenario.create({ data: { name: cleanName(name), sortOrder } });
}

export async function renameIntensityScenario(id: string, name: string) {
  const to = cleanName(name);
  return prisma.$transaction(async (tx) => {
    const { name: from } = await tx.intensityScenario.findUniqueOrThrow({ where: { id }, select: { name: true } });
    const scenario = await tx.intensityScenario.update({ where: { id }, data: { name: to } });
    if (from !== to) await rewriteSavedQueries(tx, { kind: "scenario", from, to });
    return scenario;
  });
}

export async function deleteIntensityScenario(id: string) {
  const used = await prisma.contributionAct.count({ where: { act: { scenarioId: id } } });
  if (used > 0) throw new Error(`Its acts are ticked in ${used} ${used === 1 ? "session" : "sessions"}.`);
  await prisma.intensityScenario.delete({ where: { id } });
}

/** Moves a scenario one place left (-1) or right (+1) */
export async function moveIntensityScenario(id: string, direction: -1 | 1) {
  await prisma.$transaction(async (tx) => {
    const all = await tx.intensityScenario.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
    const i = all.findIndex((s) => s.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [sortOrder, s] of all.entries()) {
      await tx.intensityScenario.update({ where: { id: s.id }, data: { sortOrder } });
    }
  });
}

// ─── Acts ────────────────────────────────────────────────────────────────────

export async function createIntensityAct(scenarioId: string, name: string, level: number) {
  checkStep(level, "The level");
  return prisma.intensityAct.create({ data: { scenarioId, name: cleanName(name), level } });
}

export async function updateIntensityAct(
  id: string,
  data: { name?: string; description?: string | null; level?: number },
) {
  if (data.level !== undefined) checkStep(data.level, "The level");
  const to = data.name === undefined ? undefined : cleanName(data.name);
  return prisma.$transaction(async (tx) => {
    const before = await tx.intensityAct.findUniqueOrThrow({
      where: { id },
      select: { name: true, scenario: { select: { name: true } } },
    });
    const act = await tx.intensityAct.update({
      where: { id },
      data: {
        ...(to !== undefined && { name: to }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.level !== undefined && { level: data.level }),
      },
    });
    if (to !== undefined && to !== before.name) {
      const nameStaysTaken =
        (await tx.intensityAct.count({ where: { name: { equals: before.name, mode: "insensitive" } } })) > 0;
      await rewriteSavedQueries(tx, { kind: "act", scenario: before.scenario.name, from: before.name, to, nameStaysTaken });
    }
    return act;
  });
}

export async function deleteIntensityAct(id: string) {
  const used = await prisma.contributionAct.count({ where: { actId: id } });
  if (used > 0) throw new Error(`Ticked in ${used} ${used === 1 ? "session" : "sessions"}.`);
  await prisma.intensityAct.delete({ where: { id } });
}

// ─── Extra groups ────────────────────────────────────────────────────────────

export async function createIntensityExtraGroup(name: string) {
  const sortOrder = await nextSortOrder(prisma.intensityExtraGroup.aggregate({ _max: { sortOrder: true } }));
  return prisma.intensityExtraGroup.create({ data: { name: cleanName(name), sortOrder } });
}

export async function renameIntensityExtraGroup(id: string, name: string) {
  return prisma.intensityExtraGroup.update({ where: { id }, data: { name: cleanName(name) } });
}

/** Deletes a group; its extras stay, ungrouped */
export async function deleteIntensityExtraGroup(id: string) {
  await prisma.intensityExtraGroup.delete({ where: { id } });
}

// ─── Extras ──────────────────────────────────────────────────────────────────

export async function createIntensityExtra(name: string, points: number, groupId: string | null) {
  checkStep(points, "Points");
  const sortOrder = await nextSortOrder(prisma.intensityExtra.aggregate({ _max: { sortOrder: true } }));
  return prisma.intensityExtra.create({ data: { name: cleanName(name), points, groupId, sortOrder } });
}

/**
 * A group allows one of its extras per person in a session (and per act). Moving
 * an extra into a group must not leave a session holding two of them — both
 * would count.
 */
async function checkGroupStaysSingle(extraId: string, groupId: string) {
  const others = { extra: { groupId, id: { not: extraId } } };
  const [people, acts] = await Promise.all([
    prisma.sessionContribution.count({
      where: { intensityExtras: { some: { extraId } }, AND: { intensityExtras: { some: others } } },
    }),
    prisma.contributionAct.count({
      where: { extras: { some: { extraId, mode: "ADD" } }, AND: { extras: { some: { ...others, mode: "ADD" } } } },
    }),
  ]);
  const clashes = people + acts;
  if (clashes > 0) {
    const group = await prisma.intensityExtraGroup.findUnique({ where: { id: groupId }, select: { name: true } });
    throw new Error(
      `Sessions hold it together with another ${group?.name ?? "group"} extra ${clashes === 1 ? "once" : `${clashes} times`} — take one of them off first.`,
    );
  }
}

export async function updateIntensityExtra(
  id: string,
  data: { name?: string; points?: number; groupId?: string | null },
) {
  const extra = await prisma.intensityExtra.findUniqueOrThrow({ where: { id }, select: { isMax: true } });
  if (extra.isMax && (data.points !== undefined || data.groupId !== undefined)) {
    throw new Error("Max always sets 10 — only its name can change.");
  }
  if (data.points !== undefined) checkStep(data.points, "Points");
  if (data.groupId) await checkGroupStaysSingle(id, data.groupId);
  return prisma.intensityExtra.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: cleanName(data.name) }),
      ...(data.points !== undefined && { points: data.points }),
      ...(data.groupId !== undefined && { groupId: data.groupId }),
    },
  });
}

export async function deleteIntensityExtra(id: string) {
  const extra = await prisma.intensityExtra.findUniqueOrThrow({
    where: { id },
    select: { isMax: true, _count: { select: { contributions: true, actOverrides: true } } },
  });
  if (extra.isMax) throw new Error("Max cannot be deleted — rename it instead.");
  const used = extra._count.contributions + extra._count.actOverrides;
  if (used > 0) throw new Error(`Used ${used} ${used === 1 ? "time" : "times"} in sessions.`);
  await prisma.intensityExtra.delete({ where: { id } });
}
