import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { copyIntensityLikeLastTime, getIntensityHints, undoIntensityPreset } from "@/lib/services/intensity-service";

// "Like last time" and the channel's usual preset (2026-10-27): a model's own
// earlier confirmed session — same channel first — copied in (acts with their
// departures and extras, no notes or photos, to review, with Undo), and the
// preset most confirmed models of the channel carry. Neither applies by itself.
const RUN = `ilt${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

const contribution = (id: string) =>
  prisma.sessionContribution.findUniqueOrThrow({
    where: { id },
    select: {
      intensityReviewedAt: true,
      intensityExtras: { select: { extraId: true } },
      intensityActs: { select: { actId: true, notes: true, presetId: true, extras: { select: { extraId: true, mode: true } }, media: true } },
    },
  });

beforeAll(async () => {
  for (const who of ["anna", "bea", "cara", "guest"]) {
    ids[who] = (await prisma.person.create({ data: { icgId: `${RUN}-${who}`.toUpperCase(), sexAtBirth: "female" } })).id;
  }
  ids.chA = (await prisma.channel.create({ data: { name: `${RUN} Alpha` } })).id;
  ids.chB = (await prisma.channel.create({ data: { name: `${RUN} Beta` } })).id;
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} scenario`, sortOrder: 99 } })).id;
  ids.low = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "low", level: 2 } })).id;
  ids.mid = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "mid", level: 4 } })).id;
  ids.high = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "high", level: 6 } })).id;
  ids.group = (await prisma.intensityExtraGroup.create({ data: { name: `${RUN} where` } })).id;
  ids.semi = (await prisma.intensityExtra.create({ data: { name: `${RUN} semi`, points: 1, groupId: ids.group } })).id;
  ids.secluded = (await prisma.intensityExtra.create({ data: { name: `${RUN} secluded`, points: 0.5, groupId: ids.group } })).id;
  ids.first = (await prisma.intensityExtra.create({ data: { name: `${RUN} first`, points: 1 } })).id;
  ids.p1 = (await prisma.intensityPreset.create({ data: { scenarioId: ids.scenario!, name: `${RUN} p1`, sortOrder: 0 } })).id;
  ids.p2 = (await prisma.intensityPreset.create({ data: { scenarioId: ids.scenario!, name: `${RUN} p2`, sortOrder: 1 } })).id;

  async function session(key: string, ch: string, date: string) {
    ids[key] = (await prisma.session.create({ data: { name: `${RUN} ${key}`, date: new Date(date) } })).id;
    const set = await prisma.set.create({ data: { title: `${RUN} ${key}`, type: "photo", channelId: ids[ch]! } });
    await prisma.setSession.create({ data: { setId: set.id, sessionId: ids[key]!, isPrimary: true } });
  }
  async function lead(key: string, who: string, reviewed: boolean, acts: [string, string | null][], extras: string[] = []) {
    const c = await prisma.sessionContribution.create({
      data: { sessionId: ids[key]!, personId: ids[who]!, roleDefinitionId: "crd_model", intensityReviewedAt: reviewed ? new Date() : null },
    });
    for (const [act, preset] of acts) await prisma.contributionAct.create({ data: { contributionId: c.id, actId: ids[act]!, presetId: preset ? ids[preset]! : null } });
    if (extras.length) await prisma.contributionExtra.createMany({ data: extras.map((e) => ({ contributionId: c.id, extraId: ids[e]! })) });
    return c.id;
  }

  await session("old", "chA", "2019-05-01");
  await session("nearB", "chB", "2023-01-01");
  await session("openA", "chA", "2022-01-01");
  await session("beaA", "chA", "2020-01-01");
  await session("caraA", "chA", "2021-01-01");
  await session("now", "chA", "2024-06-01");

  ids.cOld = await lead("old", "anna", true, [["low", "p1"], ["mid", null]], ["semi"]);
  // mid there had its own extra, a note and a photo
  const mid = await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: ids.cOld, actId: ids.mid! } });
  await prisma.contributionAct.update({ where: { id: mid.id }, data: { notes: "from the old shoot" } });
  await prisma.contributionActExtra.create({ data: { contributionActId: mid.id, extraId: ids.first!, mode: "ADD" } });
  ids.photo = (await prisma.mediaItem.create({ data: { sessionId: ids.old!, mediaType: "PHOTO", filename: `${RUN}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1, fileRef: `${RUN}.jpg` } })).id;
  await prisma.contributionActMedia.create({ data: { contributionActId: mid.id, mediaItemId: ids.photo } });

  ids.cNearB = await lead("nearB", "anna", true, [["high", null]]);
  ids.cOpenA = await lead("openA", "anna", false, [["high", null]]);
  await lead("beaA", "bea", true, [["low", "p2"]]);
  await lead("caraA", "cara", true, [["low", "p2"], ["mid", "p2"]]);
  ids.cNow = await lead("now", "anna", true, [["low", null]], ["secluded"]);
  // Ticked with p1 here — this session itself never counts toward its channel's usual
  ids.cBeaNow = await lead("now", "bea", true, [["low", "p1"]]);
  ids.cGuest = (await prisma.sessionContribution.create({ data: { sessionId: ids.now!, personId: ids.guest!, roleDefinitionId: "crd_appearance" } })).id;
});

afterAll(async () => {
  const sessions = await prisma.session.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  await prisma.sessionContribution.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.mediaItem.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.setSession.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.setParticipant.deleteMany({ where: { set: { title: { startsWith: RUN } } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: RUN.toUpperCase() } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityPreset.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityExtra.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityExtraGroup.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("intensity hints", () => {
  it("names each model's last confirmed session — same channel over a nearer one, never an unconfirmed one", async () => {
    const hints = await getIntensityHints(ids.now!);
    expect(hints.channel).toEqual({ id: ids.chA, name: `${RUN} Alpha` });
    const anna = hints.lastTime[ids.cNow!]!;
    expect(anna.sessionId).toBe(ids.old);
    expect(anna.channel).toBe(`${RUN} Alpha`);
    expect(anna.acts.map((a) => a.actId).sort()).toEqual([ids.low, ids.mid].sort());
    // Bea's only other session is in the channel too
    expect(hints.lastTime[ids.cBeaNow!]?.sessionId).toBe(ids.beaA);
    // Someone only appearing carries no intensity
    expect(ids.cGuest! in hints.lastTime).toBe(false);
  });

  it("offers the preset most confirmed models of the channel carry, this session not counted", async () => {
    expect((await getIntensityHints(ids.now!)).usual).toEqual({ presetId: ids.p2, models: 2 });
  });
});

describe("like last time", () => {
  it("adds the missing acts with their departures, lays the extras over, puts to review — no notes, no photos; Undo restores", async () => {
    const undo = await copyIntensityLikeLastTime([{ fromId: ids.cOld!, toId: ids.cNow! }]);
    expect(undo.presetId).toBeNull();
    expect(undo.people).toEqual([
      { contributionId: ids.cNow, actIds: [ids.mid], extraIds: [ids.secluded], reviewedAt: expect.any(String) },
    ]);
    let now = await contribution(ids.cNow!);
    expect(now.intensityReviewedAt).toBeNull();
    // semi replaces secluded: one per group
    expect(now.intensityExtras.map((e) => e.extraId)).toEqual([ids.semi]);
    const mid = now.intensityActs.find((a) => a.actId === ids.mid)!;
    expect(mid).toMatchObject({ notes: null, presetId: null, extras: [{ extraId: ids.first, mode: "ADD" }], media: [] });
    // The tick already there stays as it was
    expect(now.intensityActs.filter((a) => a.actId === ids.low)).toHaveLength(1);

    await undoIntensityPreset(undo);
    now = await contribution(ids.cNow!);
    expect(now.intensityActs.map((a) => a.actId)).toEqual([ids.low]);
    expect(now.intensityExtras.map((e) => e.extraId)).toEqual([ids.secluded]);
    expect(now.intensityReviewedAt).not.toBeNull();
  });

  it("refuses an unconfirmed source, someone else's session and a person only appearing", async () => {
    await expect(copyIntensityLikeLastTime([{ fromId: ids.cOpenA!, toId: ids.cNow! }])).rejects.toThrow(/not confirmed/);
    await expect(copyIntensityLikeLastTime([{ fromId: ids.cOld!, toId: ids.cBeaNow! }])).rejects.toThrow(/same person/);
    await expect(copyIntensityLikeLastTime([{ fromId: ids.cOld!, toId: ids.cGuest! }])).rejects.toThrow(/only appearing/);
  });
});
