import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { overridesFor, suggestScenarioIds } from "@/lib/intensity";
import { BEHIND_CAMERA_GROUP } from "@/lib/services/session-contributors";

// Intensity on sessions (ADR-0036, slice 2): per on-camera contribution, the
// extras set for the person in that session and the acts ticked, each act with
// its departures from those extras. Values are computed from these on read.

type TxClient = Prisma.TransactionClient;

/** The on-camera contributions of a session with their intensity, and the scenarios their cast suggests */
export async function getSessionIntensity(sessionId: string) {
  const contributions = await prisma.sessionContribution.findMany({
    where: { sessionId, roleDefinition: { group: { name: { not: BEHIND_CAMERA_GROUP } } } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      roleDefinition: { select: { name: true } },
      person: {
        select: {
          id: true,
          icgId: true,
          sexAtBirth: true,
          aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
        },
      },
      intensityExtras: { select: { extraId: true } },
      intensityActs: {
        orderBy: { createdAt: "asc" },
        select: { id: true, actId: true, notes: true, extras: { select: { extraId: true, mode: true } } },
      },
    },
  });

  return contributions.map((c) => {
    const others = new Map(
      contributions.filter((o) => o.person.id !== c.person.id).map((o) => [o.person.id, o.person.sexAtBirth]),
    );
    return {
      id: c.id,
      roleName: c.roleDefinition.name,
      person: {
        id: c.person.id,
        icgId: c.person.icgId,
        name: c.person.aliases[0]?.name ?? c.person.icgId ?? c.person.id,
      },
      suggestedScenarioIds: suggestScenarioIds(c.person.sexAtBirth, [...others.values()]),
      extraIds: c.intensityExtras.map((e) => e.extraId),
      acts: c.intensityActs.map((a) => ({ id: a.id, actId: a.actId, notes: a.notes, overrides: a.extras })),
    };
  });
}

export type SessionIntensity = Awaited<ReturnType<typeof getSessionIntensity>>;

/** At most one extra per group; returns the extras, all known */
async function checkExtras(tx: TxClient, extraIds: string[]) {
  const unique = [...new Set(extraIds)];
  const extras = await tx.intensityExtra.findMany({ where: { id: { in: unique } }, select: { id: true, groupId: true } });
  if (extras.length !== unique.length) throw new Error("Unknown extra.");
  const groups = extras.map((e) => e.groupId).filter((g): g is string => g !== null);
  if (new Set(groups).size !== groups.length) throw new Error("Only one extra per group.");
  return unique;
}

/** Sets the extras for a person in a session — every act there inherits them */
export async function setContributionExtras(contributionId: string, extraIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const ids = await checkExtras(tx, extraIds);
    await tx.contributionExtra.deleteMany({ where: { contributionId } });
    if (ids.length) await tx.contributionExtra.createMany({ data: ids.map((extraId) => ({ contributionId, extraId })) });
  });
}

/** Sets the extras of several people in a session at once — each their own list */
export async function setContributionsExtras(entries: { contributionId: string; extraIds: string[] }[]) {
  await prisma.$transaction(async (tx) => {
    for (const { contributionId, extraIds } of entries) {
      const ids = await checkExtras(tx, extraIds);
      await tx.contributionExtra.deleteMany({ where: { contributionId } });
      if (ids.length) await tx.contributionExtra.createMany({ data: ids.map((extraId) => ({ contributionId, extraId })) });
    }
  });
}

/** Ticks or unticks one act for several people in a session at once */
export async function setContributionsAct(contributionIds: string[], actId: string, ticked: boolean) {
  await prisma.$transaction(async (tx) => {
    if (ticked) {
      await tx.contributionAct.createMany({ data: contributionIds.map((contributionId) => ({ contributionId, actId })), skipDuplicates: true });
    } else {
      await tx.contributionAct.deleteMany({ where: { contributionId: { in: contributionIds }, actId } });
    }
  });
}

/** Puts unticked acts back as they were — note and own extras included (undo) */
export async function restoreContributionActs(
  items: { contributionId: string; actId: string; notes: string | null; overrides: { extraId: string; mode: "ADD" | "DROP" }[] }[],
) {
  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const row = await tx.contributionAct.upsert({
        where: { contributionId_actId: { contributionId: it.contributionId, actId: it.actId } },
        create: { contributionId: it.contributionId, actId: it.actId, notes: it.notes },
        update: { notes: it.notes },
      });
      await tx.contributionActExtra.deleteMany({ where: { contributionActId: row.id } });
      if (it.overrides.length) {
        await tx.contributionActExtra.createMany({ data: it.overrides.map((o) => ({ contributionActId: row.id, ...o })) });
      }
    }
  });
}

/**
 * "Same as …": gives a person in a session another person's extras, and the
 * acts the other has that they lack — with the other's departures, not notes.
 * Acts they already have stay as they are.
 */
export async function copyContributionIntensity(fromId: string, toId: string) {
  await prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.sessionContribution.findUniqueOrThrow({
        where: { id: fromId },
        select: {
          sessionId: true,
          intensityExtras: { select: { extraId: true } },
          intensityActs: { select: { actId: true, extras: { select: { extraId: true, mode: true } } } },
        },
      }),
      tx.sessionContribution.findUniqueOrThrow({
        where: { id: toId },
        select: { sessionId: true, intensityActs: { select: { actId: true } } },
      }),
    ]);
    if (from.sessionId !== to.sessionId) throw new Error("Both must be in the same session.");
    await tx.contributionExtra.deleteMany({ where: { contributionId: toId } });
    if (from.intensityExtras.length) {
      await tx.contributionExtra.createMany({ data: from.intensityExtras.map((e) => ({ contributionId: toId, extraId: e.extraId })) });
    }
    const has = new Set(to.intensityActs.map((a) => a.actId));
    for (const a of from.intensityActs.filter((a) => !has.has(a.actId))) {
      const row = await tx.contributionAct.create({ data: { contributionId: toId, actId: a.actId } });
      if (a.extras.length) {
        await tx.contributionActExtra.createMany({ data: a.extras.map((e) => ({ contributionActId: row.id, ...e })) });
      }
    }
  });
}

/** The one session these contributions share — refuses a mix */
export async function getContributionsSessionId(contributionIds: string[]): Promise<string> {
  const rows = await prisma.sessionContribution.findMany({ where: { id: { in: contributionIds } }, select: { sessionId: true } });
  const sessions = new Set(rows.map((r) => r.sessionId));
  if (rows.length !== new Set(contributionIds).size || sessions.size !== 1) throw new Error("Contributions must share one session.");
  return [...sessions][0]!;
}

/** Ticks or unticks an act for a person in a session */
export async function setContributionAct(contributionId: string, actId: string, ticked: boolean) {
  if (ticked) {
    await prisma.contributionAct.upsert({
      where: { contributionId_actId: { contributionId, actId } },
      create: { contributionId, actId },
      update: {},
    });
  } else {
    await prisma.contributionAct.deleteMany({ where: { contributionId, actId } });
  }
}

/** A short note on one act as this person did it here; empty removes it */
export async function setContributionActNote(contributionActId: string, note: string) {
  await prisma.contributionAct.update({ where: { id: contributionActId }, data: { notes: note.trim() || null } });
}

/**
 * Sets the extras one act carries. Stored as its departures from the person's
 * session extras: ADD what they lack, DROP what it does without — so a later
 * change to the session extras still reaches the act wherever it agreed.
 */
export async function setContributionActExtras(contributionActId: string, extraIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const ids = await checkExtras(tx, extraIds);
    const act = await tx.contributionAct.findUniqueOrThrow({
      where: { id: contributionActId },
      select: { contribution: { select: { intensityExtras: { select: { extraId: true } } } } },
    });
    const inherited = act.contribution.intensityExtras.map((e) => e.extraId);
    const rows = overridesFor(inherited, ids).map((o) => ({ contributionActId, ...o }));
    await tx.contributionActExtra.deleteMany({ where: { contributionActId } });
    if (rows.length) await tx.contributionActExtra.createMany({ data: rows });
  });
}

/**
 * Session merge: carries one contribution's intensity onto another for the same
 * person and role. Acts the target lacks move over with their departures and
 * notes; where both ticked an act, the target's stays (taking the other's note
 * if it has none). Extras the target lacks are added
 * unless the target already chose one in that group.
 */
export async function mergeContributionIntensityInTx(tx: TxClient, fromId: string, toId: string) {
  const [from, to] = await Promise.all([
    tx.sessionContribution.findUniqueOrThrow({
      where: { id: fromId },
      select: {
        intensityExtras: { select: { extraId: true, extra: { select: { groupId: true } } } },
        intensityActs: { select: { id: true, actId: true, notes: true } },
      },
    }),
    tx.sessionContribution.findUniqueOrThrow({
      where: { id: toId },
      select: {
        intensityExtras: { select: { extraId: true, extra: { select: { groupId: true } } } },
        intensityActs: { select: { id: true, actId: true, notes: true } },
      },
    }),
  ]);

  const toActs = new Map(to.intensityActs.map((a) => [a.actId, a]));
  for (const a of from.intensityActs) {
    const there = toActs.get(a.actId);
    if (!there) await tx.contributionAct.update({ where: { id: a.id }, data: { contributionId: toId } });
    else if (!there.notes && a.notes) await tx.contributionAct.update({ where: { id: there.id }, data: { notes: a.notes } });
  }

  const toExtras = new Set(to.intensityExtras.map((e) => e.extraId));
  const toGroups = new Set(to.intensityExtras.map((e) => e.extra.groupId).filter(Boolean));
  const add = from.intensityExtras.filter(
    (e) => !toExtras.has(e.extraId) && !(e.extra.groupId && toGroups.has(e.extra.groupId)),
  );
  if (add.length) {
    await tx.contributionExtra.createMany({ data: add.map((e) => ({ contributionId: toId, extraId: e.extraId })) });
  }
}

export async function getContributionActSessionId(contributionActId: string): Promise<string> {
  const a = await prisma.contributionAct.findUniqueOrThrow({
    where: { id: contributionActId },
    select: { contribution: { select: { sessionId: true } } },
  });
  return a.contribution.sessionId;
}
