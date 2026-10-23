import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_INTENSITY_MAX,
  formatIntensity,
  INTENSITY_MAX_RANGE,
  intensityCap,
  isIntensityStep,
} from "@/lib/intensity";
import { getSetting, setSetting } from "@/lib/services/setting-service";
import { renameInTagQuery, type CatalogRename } from "@/lib/tag-query";

// The intensity catalog (ADR-0036): scenarios (columns, ordered by sortOrder),
// each with its own acts carrying an intensity level; extras that add fixed
// points, optionally in groups (at most one per group), and Max, which sets 10.
// The scale says in the user's words what each value means.

const MAX_KEY = "intensity-max";

/** The top of this tenant's scale (2026-10-23): a whole number, 10 unless set */
export async function getIntensityMax(): Promise<number> {
  const n = Number(await getSetting(MAX_KEY));
  return Number.isInteger(n) && n >= INTENSITY_MAX_RANGE.min && n <= INTENSITY_MAX_RANGE.max ? n : DEFAULT_INTENSITY_MAX;
}

/**
 * Sets Max; the cap follows half a step below. Lowering is refused while acts
 * sit above the new cap or values above the new Max are described — they are
 * named, nothing changes silently. The Max row's title and description travel
 * with Max. Every value is re-rated on read; no act's level changes.
 */
export async function setIntensityMax(next: number) {
  if (!Number.isInteger(next) || next < INTENSITY_MAX_RANGE.min || next > INTENSITY_MAX_RANGE.max) {
    throw new Error(`Max is a whole number from ${INTENSITY_MAX_RANGE.min} to ${INTENSITY_MAX_RANGE.max}.`);
  }
  const current = await getIntensityMax();
  if (next === current) return;
  const cap = intensityCap(next);
  const [above, described, target] = await Promise.all([
    prisma.intensityAct.findMany({
      where: { level: { gt: cap } },
      orderBy: [{ level: "desc" }, { name: "asc" }],
      select: { name: true, level: true, scenario: { select: { name: true } } },
    }),
    prisma.intensityScaleStep.findMany({
      where: { value: { gt: next, not: current } },
      orderBy: { value: "asc" },
      select: { value: true },
    }),
    prisma.intensityScaleStep.findUnique({ where: { value: next }, select: { id: true } }),
  ]);
  const problems: string[] = [];
  if (above.length) {
    const shown = above.slice(0, 5).map((a) => `${a.name} (${a.scenario.name}, ${formatIntensity(a.level)})`);
    const more = above.length > 5 ? ` and ${above.length - 5} more` : "";
    problems.push(`${above.length} ${above.length === 1 ? "act sits" : "acts sit"} above ${formatIntensity(cap)}: ${shown.join(", ")}${more}`);
  }
  if (described.length) {
    problems.push(`values above ${next} are described: ${described.map((d) => formatIntensity(d.value)).join(", ")}`);
  }
  const maxRow = await prisma.intensityScaleStep.findUnique({ where: { value: current }, select: { id: true } });
  if (maxRow && target) problems.push(`${next} has its own title — the Max row's text cannot move there`);
  if (problems.length) throw new Error(`Max cannot become ${next} — ${problems.join("; ")}. Move or clear them first.`);

  await prisma.$transaction(async (tx) => {
    if (maxRow) await tx.intensityScaleStep.update({ where: { id: maxRow.id }, data: { value: next } });
  });
  await setSetting(MAX_KEY, String(next));
}

export async function getIntensityCatalog() {
  const [max, scale, scenarios, groups, extras] = await Promise.all([
    getIntensityMax(),
    prisma.intensityScaleStep.findMany({ orderBy: { value: "asc" }, select: { value: true, title: true, description: true } }),
    prisma.intensityScenario.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        acts: {
          orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
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
  return { max, scale, scenarios, groups, extras };
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
  if (!isIntensityStep(value) || value > (await getIntensityMax())) throw new Error("Not a value on the scale.");
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

async function checkLevel(level: number) {
  checkStep(level, "The level");
  const max = await getIntensityMax();
  const cap = intensityCap(max);
  if (level > cap) throw new Error(`The level goes up to ${formatIntensity(cap)} — only Max reaches ${max}.`);
}

/** The next place at the end of a cell (scenario × level) */
async function endOfCell(tx: Prisma.TransactionClient, scenarioId: string, level: number) {
  return nextSortOrder(tx.intensityAct.aggregate({ where: { scenarioId, level }, _max: { sortOrder: true } }));
}

export async function createIntensityAct(scenarioId: string, name: string, level: number) {
  await checkLevel(level);
  return prisma.$transaction(async (tx) =>
    tx.intensityAct.create({
      data: { scenarioId, name: cleanName(name), level, sortOrder: await endOfCell(tx, scenarioId, level) },
    }),
  );
}

export type IntensityActPlace = {
  scenarioId: string;
  level: number;
  /** The act to stand before in that cell; null for the end */
  beforeId: string | null;
};

/**
 * Moves acts into a cell — another scenario and/or level — at a place in its
 * order, keeping their given order (the board, 2026-10-23). The cell is
 * renumbered; ticks, photos and extras stay with the acts.
 */
export async function moveIntensityActs(ids: string[], to: IntensityActPlace) {
  await checkLevel(to.level);
  const moving = [...new Set(ids)];
  if (moving.length === 0) return;
  await prisma.$transaction(async (tx) => {
    const acts = await tx.intensityAct.findMany({ where: { id: { in: moving } }, select: { id: true, name: true, scenarioId: true } });
    if (acts.length !== moving.length) throw new Error("An act is gone — reload the page.");
    const names = new Set<string>();
    for (const a of acts) {
      if (names.has(a.name)) throw new Error(`Two acts called “${a.name}” cannot share a scenario.`);
      names.add(a.name);
    }
    const scenario = await tx.intensityScenario.findUniqueOrThrow({
      where: { id: to.scenarioId },
      select: { name: true, acts: { where: { id: { notIn: moving } }, select: { name: true } } },
    });
    const clash = scenario.acts.find((a) => names.has(a.name));
    if (clash) throw new Error(`${scenario.name} already has “${clash.name}”.`);

    const stay = await tx.intensityAct.findMany({
      where: { scenarioId: to.scenarioId, level: to.level, id: { notIn: moving } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const order = stay.map((a) => a.id);
    const at = to.beforeId ? order.indexOf(to.beforeId) : -1;
    order.splice(at < 0 ? order.length : at, 0, ...moving);
    for (const [sortOrder, id] of order.entries()) {
      await tx.intensityAct.update({
        where: { id },
        data: moving.includes(id) ? { scenarioId: to.scenarioId, level: to.level, sortOrder } : { sortOrder },
      });
    }
  });
}

export async function updateIntensityAct(
  id: string,
  data: { name?: string; description?: string | null; level?: number },
) {
  if (data.level !== undefined) await checkLevel(data.level);
  const to = data.name === undefined ? undefined : cleanName(data.name);
  return prisma.$transaction(async (tx) => {
    const before = await tx.intensityAct.findUniqueOrThrow({
      where: { id },
      select: { name: true, level: true, scenarioId: true, scenario: { select: { name: true } } },
    });
    // A new level puts it at the end of its new row
    const relevel = data.level !== undefined && data.level !== before.level;
    const act = await tx.intensityAct.update({
      where: { id },
      data: {
        ...(to !== undefined && { name: to }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(relevel && { level: data.level, sortOrder: await endOfCell(tx, before.scenarioId, data.level!) }),
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

/** Where an act is ticked: each person and session, newest session first (the act's panel, K2) */
export async function getIntensityActUsage(actId: string) {
  const rows = await prisma.contributionAct.findMany({
    where: { actId },
    select: {
      id: true,
      contribution: {
        select: {
          session: { select: { id: true, name: true, date: true, datePrecision: true } },
          person: {
            select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } },
          },
        },
      },
    },
  });
  return rows
    .map(({ id, contribution: { session, person } }) => ({
      id,
      session,
      person: { id: person.id, icgId: person.icgId, name: person.aliases[0]?.name ?? person.icgId },
    }))
    .sort((a, b) => (b.session.date?.getTime() ?? -Infinity) - (a.session.date?.getTime() ?? -Infinity));
}

export type IntensityActUsage = Awaited<ReturnType<typeof getIntensityActUsage>>;

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
