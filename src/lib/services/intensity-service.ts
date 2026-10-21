import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { overridesFor, suggestScenarioIds } from "@/lib/intensity";
import { summarizePersonIntensity } from "@/lib/intensity-person";
import { BEHIND_CAMERA_GROUP } from "@/lib/services/session-contributors";
import { buildPhotoUrls } from "@/lib/media-url";
import type { PhotoVariants } from "@/lib/types";

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
        select: {
          id: true,
          actId: true,
          notes: true,
          extras: { select: { extraId: true, mode: true } },
          media: { orderBy: { createdAt: "asc" }, select: { mediaItemId: true } },
        },
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
      acts: c.intensityActs.map((a) => ({
        id: a.id,
        actId: a.actId,
        notes: a.notes,
        overrides: a.extras,
        mediaIds: a.media.map((m) => m.mediaItemId),
      })),
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

/** Puts unticked acts back as they were — note, own extras and photos included (undo) */
export async function restoreContributionActs(
  items: {
    contributionId: string;
    actId: string;
    notes: string | null;
    overrides: { extraId: string; mode: "ADD" | "DROP" }[];
    mediaIds?: string[];
  }[],
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
      if (it.mediaIds?.length) await linkEvidence(tx, [row.id], it.mediaIds);
    }
  });
}

// ─── Photos as evidence (slice 3b) ───────────────────────────────────────────

/** Links photos to acts, each photo only where it belongs to the act's session; returns how many were new */
async function linkEvidence(tx: TxClient, contributionActIds: string[], mediaItemIds: string[]) {
  const [acts, media] = await Promise.all([
    tx.contributionAct.findMany({
      where: { id: { in: contributionActIds } },
      select: { id: true, contribution: { select: { sessionId: true } } },
    }),
    tx.mediaItem.findMany({ where: { id: { in: mediaItemIds } }, select: { id: true, sessionId: true } }),
  ]);
  if (acts.length !== new Set(contributionActIds).size) throw new Error("That act is no longer ticked.");
  const data = acts.flatMap((a) =>
    media.filter((m) => m.sessionId === a.contribution.sessionId).map((m) => ({ contributionActId: a.id, mediaItemId: m.id })),
  );
  if (data.length === 0) return 0;
  return (await tx.contributionActMedia.createMany({ data, skipDuplicates: true })).count;
}

/** Links or unlinks photos as evidence for acts — a gallery selection, or one photo in the lightbox */
export async function setActsEvidence(contributionActIds: string[], mediaItemIds: string[], linked: boolean) {
  await prisma.$transaction(async (tx) => {
    if (linked) await linkEvidence(tx, contributionActIds, mediaItemIds);
    else {
      await tx.contributionActMedia.deleteMany({
        where: { contributionActId: { in: contributionActIds }, mediaItemId: { in: mediaItemIds } },
      });
    }
  });
}

/** The photos that show one act as this person did it — replaces what was there (the panel's picker) */
export async function setActEvidence(contributionActId: string, mediaItemIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.contributionActMedia.deleteMany({
      where: { contributionActId, mediaItemId: { notIn: mediaItemIds } },
    });
    if (mediaItemIds.length) await linkEvidence(tx, [contributionActId], mediaItemIds);
  });
}

/** The one session these ticked acts share — refuses a mix */
export async function getContributionActsSessionId(contributionActIds: string[]): Promise<string> {
  const rows = await prisma.contributionAct.findMany({
    where: { id: { in: contributionActIds } },
    select: { contribution: { select: { sessionId: true } } },
  });
  const sessions = new Set(rows.map((r) => r.contribution.sessionId));
  if (rows.length !== new Set(contributionActIds).size || sessions.size !== 1) throw new Error("Acts must share one session.");
  return [...sessions][0]!;
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
 * person and role. Acts the target lacks move over with their departures,
 * notes and photos; where both ticked an act, the target's stays (taking the
 * other's note if it has none, and its photos). Extras the target lacks are added
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
    if (!there) {
      await tx.contributionAct.update({ where: { id: a.id }, data: { contributionId: toId } });
      continue;
    }
    if (!there.notes && a.notes) await tx.contributionAct.update({ where: { id: there.id }, data: { notes: a.notes } });
    // Its photos join the act that stays
    const photos = await tx.contributionActMedia.findMany({ where: { contributionActId: a.id }, select: { mediaItemId: true } });
    if (photos.length) {
      await tx.contributionActMedia.createMany({
        data: photos.map((p) => ({ contributionActId: there.id, mediaItemId: p.mediaItemId })),
        skipDuplicates: true,
      });
    }
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

/** A person's intensity across their sessions — peaks, mean, first times, the course (slice 3) */
export async function getPersonIntensity(personId: string) {
  const [contributions, acts, extras] = await Promise.all([
    prisma.sessionContribution.findMany({
      where: { personId, roleDefinition: { group: { name: { not: BEHIND_CAMERA_GROUP } } } },
      select: {
        session: { select: { id: true, name: true, date: true, datePrecision: true } },
        intensityExtras: { select: { extraId: true } },
        intensityActs: { select: { actId: true, extras: { select: { extraId: true, mode: true } } } },
      },
    }),
    prisma.intensityAct.findMany({ select: { id: true, level: true, scenarioId: true } }),
    prisma.intensityExtra.findMany({ select: { id: true, points: true, groupId: true, isMax: true } }),
  ]);
  return summarizePersonIntensity(
    contributions
      .filter((c) => c.intensityActs.length > 0 || c.intensityExtras.length > 0)
      .map((c) => ({
        sessionId: c.session.id,
        sessionName: c.session.name,
        date: c.session.date,
        precision: c.session.datePrecision,
        extraIds: c.intensityExtras.map((e) => e.extraId),
        acts: c.intensityActs.map((a) => ({ actId: a.actId, overrides: a.extras })),
      })),
    {
      acts: new Map(acts.map((a) => [a.id, { level: a.level, scenarioId: a.scenarioId }])),
      extras: new Map(extras.map((e) => [e.id, e])),
    },
  );
}

/** A person's evidence photos per act, oldest session first — the showcase on their Intensity tab (3b) */
export async function getPersonActEvidence(personId: string) {
  const rows = await prisma.contributionActMedia.findMany({
    where: { contributionAct: { contribution: { personId } } },
    select: {
      contributionAct: { select: { actId: true } },
      mediaItem: {
        select: {
          id: true,
          variants: true,
          fileRef: true,
          focalX: true,
          focalY: true,
          session: { select: { id: true, date: true } },
        },
      },
    },
    orderBy: [{ mediaItem: { session: { date: { sort: "asc", nulls: "last" } } } }, { createdAt: "asc" }],
  });
  const byAct: Record<string, { id: string; thumbUrl: string; focalX: number | null; focalY: number | null; sessionId: string }[]> = {};
  for (const r of rows) {
    const urls = buildPhotoUrls((r.mediaItem.variants ?? {}) as PhotoVariants, r.mediaItem.fileRef);
    (byAct[r.contributionAct.actId] ??= []).push({
      id: r.mediaItem.id,
      thumbUrl: urls.gallery_512 ?? urls.profile_256 ?? urls.original,
      focalX: r.mediaItem.focalX,
      focalY: r.mediaItem.focalY,
      sessionId: r.mediaItem.session.id,
    });
  }
  return byAct;
}

export type PersonActEvidence = Awaited<ReturnType<typeof getPersonActEvidence>>;
