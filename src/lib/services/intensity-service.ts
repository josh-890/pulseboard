import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { overridesFor, pickLastTime, presetAdditions, suggestScenarioIds, usualPreset } from "@/lib/intensity";
import { summarizePersonIntensity } from "@/lib/intensity-person";
import { LEAD_ROLE } from "@/lib/services/session-contributors";
import { getIntensityMax } from "@/lib/services/intensity-catalog-service";
import { buildPhotoUrls } from "@/lib/media-url";
import type { PhotoVariants } from "@/lib/types";

// Intensity on sessions (ADR-0036, slice 2): per on-camera contribution, the
// extras set for the person in that session and the acts ticked, each act with
// its departures from those extras. Values are computed from these on read.

type TxClient = Prisma.TransactionClient;

/** The on-camera contributions of a session with their intensity, and the scenarios their cast suggests */
export async function getSessionIntensity(sessionId: string) {
  const contributions = await prisma.sessionContribution.findMany({
    where: { sessionId, roleDefinition: LEAD_ROLE },
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
      intensityReviewedAt: true,
      intensityExtras: { select: { extraId: true } },
      intensityActs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          actId: true,
          presetId: true,
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
      reviewed: c.intensityReviewedAt !== null,
      extraIds: c.intensityExtras.map((e) => e.extraId),
      acts: c.intensityActs.map((a) => ({
        id: a.id,
        actId: a.actId,
        presetId: a.presetId,
        notes: a.notes,
        overrides: a.extras,
        mediaIds: a.media.map((m) => m.mediaItemId),
      })),
    };
  });
}

export type SessionIntensity = Awaited<ReturnType<typeof getSessionIntensity>>;

/**
 * A set's intensity (2026-10-24): its sessions' — a set is a release of what
 * was shot — with each session's people and acts, the acts this set leaves out,
 * and which acts have an evidence photo in the set (a hint to leave one out).
 * `shared`: the session has other sets too, so leaving out makes sense.
 */
export async function getSetIntensity(setId: string) {
  const links = await prisma.setSession.findMany({
    where: { setId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      session: { select: { id: true, name: true, date: true, datePrecision: true, _count: { select: { setSessionLinks: true } } } },
    },
  });
  const [sessions, excluded, evidence] = await Promise.all([
    Promise.all(
      links.map(async ({ session }) => ({
        id: session.id,
        name: session.name,
        date: session.date,
        datePrecision: session.datePrecision,
        shared: session._count.setSessionLinks > 1,
        contributions: await getSessionIntensity(session.id),
        hints: await getIntensityHints(session.id),
      })),
    ),
    prisma.setActExclusion.findMany({ where: { setId }, select: { contributionActId: true } }),
    prisma.contributionActMedia.findMany({
      where: { mediaItem: { setMediaItems: { some: { setId } } } },
      distinct: ["contributionActId"],
      select: { contributionActId: true },
    }),
  ]);
  return {
    sessions,
    excluded: excluded.map((e) => e.contributionActId),
    evidenceInSet: evidence.map((e) => e.contributionActId),
  };
}

export type SetIntensity = Awaited<ReturnType<typeof getSetIntensity>>;

/** Leave a ticked act out of a set — or take it back in; only for an act of one of the set's sessions */
export async function setSetActExcluded(setId: string, contributionActId: string, excluded: boolean) {
  const act = await prisma.contributionAct.findUniqueOrThrow({
    where: { id: contributionActId },
    select: { contribution: { select: { sessionId: true } } },
  });
  const linked = await prisma.setSession.findUnique({
    where: { setId_sessionId: { setId, sessionId: act.contribution.sessionId } },
    select: { setId: true },
  });
  if (!linked) throw new Error("That act is not from a session of this set.");
  if (excluded) {
    await prisma.setActExclusion.upsert({
      where: { setId_contributionActId: { setId, contributionActId } },
      create: { setId, contributionActId },
      update: {},
    });
  } else {
    await prisma.setActExclusion.deleteMany({ where: { setId, contributionActId } });
  }
}

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
    // Filled from someone else — to review again
    await tx.sessionContribution.update({ where: { id: toId }, data: { intensityReviewedAt: null } });
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

// ─── Presets and review (2026-10-24) ─────────────────────────────────────────

/** What applying a preset — or copying "like last time" (presetId null) — changed, per person: enough to take it back */
export type PresetUndo = {
  presetId: string | null;
  people: { contributionId: string; actIds: string[]; extraIds: string[]; reviewedAt: string | null }[];
};

/**
 * Applies a preset to models in one or more sessions: the acts each lacks are
 * ticked (marked as from the preset), its extras laid over theirs — a grouped
 * one replaces their choice in that group — and each is to review again.
 * Ticks they already have stay as they are. Leads only.
 */
export async function applyIntensityPreset(contributionIds: string[], presetId: string): Promise<PresetUndo> {
  const ids = [...new Set(contributionIds)];
  return prisma.$transaction(async (tx) => {
    const [preset, people, extras] = await Promise.all([
      tx.intensityPreset.findUniqueOrThrow({
        where: { id: presetId },
        select: { acts: { select: { actId: true } }, extras: { select: { extraId: true } } },
      }),
      tx.sessionContribution.findMany({
        where: { id: { in: ids }, roleDefinition: LEAD_ROLE },
        select: {
          id: true,
          intensityReviewedAt: true,
          intensityExtras: { select: { extraId: true } },
          intensityActs: { select: { actId: true } },
        },
      }),
      tx.intensityExtra.findMany({ select: { id: true, groupId: true } }),
    ]);
    if (people.length !== ids.length) throw new Error("A preset is for the models — someone only appearing carries no intensity.");
    const groups = new Map(extras.map((e) => [e.id, e.groupId]));
    const groupOf = (id: string) => groups.get(id) ?? null;
    const bundle = { actIds: preset.acts.map((a) => a.actId), extraIds: preset.extras.map((e) => e.extraId) };
    const undo: PresetUndo["people"] = [];
    for (const p of people) {
      const before = p.intensityExtras.map((e) => e.extraId);
      const add = presetAdditions({ actIds: p.intensityActs.map((a) => a.actId), extraIds: before }, bundle, groupOf);
      if (add.actIds.length) {
        await tx.contributionAct.createMany({ data: add.actIds.map((actId) => ({ contributionId: p.id, actId, presetId })) });
      }
      const next = await checkExtras(tx, add.extraIds);
      await tx.contributionExtra.deleteMany({ where: { contributionId: p.id } });
      if (next.length) await tx.contributionExtra.createMany({ data: next.map((extraId) => ({ contributionId: p.id, extraId })) });
      await tx.sessionContribution.update({ where: { id: p.id }, data: { intensityReviewedAt: null } });
      undo.push({ contributionId: p.id, actIds: add.actIds, extraIds: before, reviewedAt: p.intensityReviewedAt?.toISOString() ?? null });
    }
    return { presetId, people: undo };
  });
}

/** Takes a preset back: the acts it ticked go (if still from it), the extras and the review state return */
export async function undoIntensityPreset(undo: PresetUndo) {
  await prisma.$transaction(async (tx) => {
    for (const p of undo.people) {
      if (p.actIds.length) {
        await tx.contributionAct.deleteMany({ where: { contributionId: p.contributionId, actId: { in: p.actIds }, presetId: undo.presetId } });
      }
      const ids = await checkExtras(tx, p.extraIds);
      await tx.contributionExtra.deleteMany({ where: { contributionId: p.contributionId } });
      if (ids.length) await tx.contributionExtra.createMany({ data: ids.map((extraId) => ({ contributionId: p.contributionId, extraId })) });
      await tx.sessionContribution.update({
        where: { id: p.contributionId },
        data: { intensityReviewedAt: p.reviewedAt ? new Date(p.reviewedAt) : null },
      });
    }
  });
}

// ─── Like last time + the channel's usual preset (2026-10-27) ────────────────

/** A session's channel: its primary set's, else its first released set's — as the rating queue orders */
const CHANNEL_LINK = {
  where: { set: { channelId: { not: null } } },
  orderBy: [{ isPrimary: "desc" as const }, { set: { releaseDate: { sort: "asc" as const, nulls: "last" as const } } }, { setId: "asc" as const }],
  take: 1,
  select: { set: { select: { channel: { select: { id: true, name: true } } } } },
};

/**
 * What can speed up rating a session: per model, the confirmed session "like
 * last time" would copy (the nearest one up to this date, same channel first —
 * with its acts and extras, to show its value and copy optimistically), and the
 * preset most confirmed models of this channel carry. Neither is applied by itself.
 */
export async function getIntensityHints(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      date: true,
      setSessionLinks: CHANNEL_LINK,
      contributions: { where: { roleDefinition: LEAD_ROLE }, select: { id: true, personId: true } },
    },
  });
  const channel = session.setSessionLinks[0]?.set.channel ?? null;
  const here = { date: session.date, channelId: channel?.id ?? null };
  const personIds = [...new Set(session.contributions.map((c) => c.personId))];

  const [candidates, uses, presets] = await Promise.all([
    personIds.length === 0
      ? []
      : prisma.sessionContribution.findMany({
          where: {
            personId: { in: personIds },
            sessionId: { not: sessionId },
            roleDefinition: LEAD_ROLE,
            intensityReviewedAt: { not: null },
            intensityActs: { some: {} },
          },
          select: {
            id: true,
            personId: true,
            session: { select: { id: true, name: true, date: true, datePrecision: true, setSessionLinks: CHANNEL_LINK } },
            intensityExtras: { select: { extraId: true } },
            intensityActs: { select: { actId: true, extras: { select: { extraId: true, mode: true } } } },
          },
        }),
    channel
      ? prisma.contributionAct.findMany({
          where: {
            presetId: { not: null },
            contribution: {
              sessionId: { not: sessionId },
              roleDefinition: LEAD_ROLE,
              intensityReviewedAt: { not: null },
              session: { setSessionLinks: { some: { set: { channelId: channel.id } } } },
            },
          },
          distinct: ["contributionId", "presetId"],
          select: { presetId: true, contributionId: true },
        })
      : [],
    prisma.intensityPreset.findMany({ orderBy: [{ scenario: { sortOrder: "asc" } }, { sortOrder: "asc" }], select: { id: true } }),
  ]);

  const shaped = candidates.map((c) => {
    const ch = c.session.setSessionLinks[0]?.set.channel ?? null;
    return {
      contributionId: c.id,
      personId: c.personId,
      sessionId: c.session.id,
      sessionName: c.session.name,
      date: c.session.date,
      datePrecision: c.session.datePrecision,
      channelId: ch?.id ?? null,
      channel: ch?.name ?? null,
      extraIds: c.intensityExtras.map((e) => e.extraId),
      acts: c.intensityActs.map((a) => ({ actId: a.actId, overrides: a.extras })),
    };
  });
  const lastTime: Record<string, (typeof shaped)[number] | null> = {};
  for (const c of session.contributions) {
    lastTime[c.id] = pickLastTime(here, shaped.filter((s) => s.personId === c.personId));
  }
  return {
    channel,
    usual: usualPreset(
      uses.flatMap((u) => (u.presetId ? [{ presetId: u.presetId, contributionId: u.contributionId }] : [])),
      presets.map((p) => p.id),
    ),
    lastTime,
  };
}

export type IntensityHints = Awaited<ReturnType<typeof getIntensityHints>>;

/**
 * "Like last time": gives each model the acts they lack from their own earlier
 * confirmed session — with that session's departures, not notes or photos —
 * and lays its extras over theirs (a grouped one replaces their choice in that
 * group). Each is to review again. Returns what to take back (presetId null).
 */
export async function copyIntensityLikeLastTime(pairs: { fromId: string; toId: string }[]): Promise<PresetUndo> {
  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(pairs.flatMap((p) => [p.fromId, p.toId]))];
    const [rows, extras] = await Promise.all([
      tx.sessionContribution.findMany({
        where: { id: { in: ids }, roleDefinition: LEAD_ROLE },
        select: {
          id: true,
          personId: true,
          sessionId: true,
          intensityReviewedAt: true,
          intensityExtras: { select: { extraId: true } },
          intensityActs: { select: { actId: true, extras: { select: { extraId: true, mode: true } } } },
        },
      }),
      tx.intensityExtra.findMany({ select: { id: true, groupId: true } }),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const groups = new Map(extras.map((e) => [e.id, e.groupId]));
    const groupOf = (id: string) => groups.get(id) ?? null;
    const undo: PresetUndo["people"] = [];
    for (const { fromId, toId } of pairs) {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      if (!from || !to) throw new Error("Like last time is for the models — someone only appearing carries no intensity.");
      if (from.personId !== to.personId || from.sessionId === to.sessionId) throw new Error("Last time must be the same person in another session.");
      if (!from.intensityReviewedAt) throw new Error("That session is not confirmed — only a confirmed one is copied.");
      const before = to.intensityExtras.map((e) => e.extraId);
      const add = presetAdditions(
        { actIds: to.intensityActs.map((a) => a.actId), extraIds: before },
        { actIds: from.intensityActs.map((a) => a.actId), extraIds: from.intensityExtras.map((e) => e.extraId) },
        groupOf,
      );
      for (const a of from.intensityActs.filter((a) => add.actIds.includes(a.actId))) {
        const row = await tx.contributionAct.create({ data: { contributionId: toId, actId: a.actId } });
        if (a.extras.length) await tx.contributionActExtra.createMany({ data: a.extras.map((e) => ({ contributionActId: row.id, ...e })) });
      }
      const next = await checkExtras(tx, add.extraIds);
      await tx.contributionExtra.deleteMany({ where: { contributionId: toId } });
      if (next.length) await tx.contributionExtra.createMany({ data: next.map((extraId) => ({ contributionId: toId, extraId })) });
      await tx.sessionContribution.update({ where: { id: toId }, data: { intensityReviewedAt: null } });
      undo.push({ contributionId: toId, actIds: add.actIds, extraIds: before, reviewedAt: to.intensityReviewedAt?.toISOString() ?? null });
    }
    return { presetId: null, people: undo };
  });
}

/** Confirms models' intensity as checked — or takes the confirmation back */
export async function setIntensityReviewed(contributionIds: string[], reviewed: boolean) {
  await prisma.sessionContribution.updateMany({
    where: { id: { in: contributionIds }, roleDefinition: LEAD_ROLE },
    data: { intensityReviewedAt: reviewed ? new Date() : null },
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
  const [contributions, acts, extras, max] = await Promise.all([
    prisma.sessionContribution.findMany({
      where: { personId, roleDefinition: LEAD_ROLE },
      select: {
        session: { select: { id: true, name: true, date: true, datePrecision: true } },
        intensityExtras: { select: { extraId: true } },
        intensityActs: { select: { actId: true, extras: { select: { extraId: true, mode: true } } } },
      },
    }),
    prisma.intensityAct.findMany({ select: { id: true, level: true, scenarioId: true } }),
    prisma.intensityExtra.findMany({
      select: {
        id: true,
        points: true,
        groupId: true,
        isMax: true,
        scenariosOff: { select: { scenarioId: true } },
        group: { select: { scenariosOff: { select: { scenarioId: true } } } },
      },
    }),
    getIntensityMax(),
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
      // Where each does not count: its group's scenarios, or its own without a group; Max counts everywhere
      extras: new Map(
        extras.map(({ scenariosOff, group, ...e }) => [
          e.id,
          { ...e, offIn: e.isMax ? [] : (group ?? { scenariosOff }).scenariosOff.map((o) => o.scenarioId) },
        ]),
      ),
      max,
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
