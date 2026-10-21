import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getSessionIntensity,
  setContributionActExtras,
  setContributionActNote,
  setContributionAct,
  setContributionExtras,
} from "@/lib/services/intensity-service";
import { mergeSessionsRecord } from "@/lib/services/session-service";

// Intensity on sessions (ADR-0036, slice 2): extras per person per session, acts
// ticked, an act's own extras stored as departures, and a session merge that
// keeps all of it.
const RUN = `isv${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function person(key: string, sex: string) {
  ids[key] = (await prisma.person.create({ data: { icgId: `${RUN}-${key}`.toUpperCase(), sexAtBirth: sex } })).id;
  await prisma.personAlias.create({ data: { personId: ids[key]!, name: `${RUN} ${key}`, isCommon: true } });
}

async function contribution(session: string, who: string, role = "crd_model") {
  return (await prisma.sessionContribution.create({ data: { sessionId: ids[session]!, personId: ids[who]!, roleDefinitionId: role } })).id;
}

beforeAll(async () => {
  await person("anna", "female");
  await person("bea", "female");
  await person("carl", "male");
  ids.s1 = (await prisma.session.create({ data: { name: `${RUN} one` } })).id;
  ids.s2 = (await prisma.session.create({ data: { name: `${RUN} two` } })).id;
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} scenario`, sortOrder: 99 } })).id;
  ids.act1 = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "one", level: 3 } })).id;
  ids.act2 = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "two", level: 5 } })).id;
  ids.group = (await prisma.intensityExtraGroup.create({ data: { name: `${RUN} where` } })).id;
  ids.semi = (await prisma.intensityExtra.create({ data: { name: `${RUN} semi`, points: 1, groupId: ids.group } })).id;
  ids.pub = (await prisma.intensityExtra.create({ data: { name: `${RUN} public`, points: 2, groupId: ids.group } })).id;
  ids.first = (await prisma.intensityExtra.create({ data: { name: `${RUN} first`, points: 1 } })).id;
});

afterAll(async () => {
  const persons = [ids.anna, ids.bea, ids.carl].filter(Boolean) as string[];
  await prisma.sessionContribution.deleteMany({ where: { personId: { in: persons } } });
  await prisma.mediaItem.deleteMany({ where: { filename: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.personAlias.deleteMany({ where: { personId: { in: persons } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
  await prisma.intensityExtra.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityExtraGroup.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("a session's intensity", () => {
  it("suggests scenarios from the on-camera cast only", async () => {
    ids.c1 = await contribution("s1", "anna");
    ids.cPhoto = await contribution("s1", "carl", "crd_photographer");
    let rows = await getSessionIntensity(ids.s1!);
    expect(rows.map((r) => r.person.name)).toEqual([`${RUN} anna`]); // the photographer is behind the camera
    expect(rows[0]!.suggestedScenarioIds).toEqual(["dsit-glamour", "dsit-solo"]);

    await contribution("s1", "bea");
    rows = await getSessionIntensity(ids.s1!);
    expect(rows.map((r) => r.suggestedScenarioIds)).toEqual([["dsit-gg"], ["dsit-gg"]]);
  });

  it("allows one extra per group", async () => {
    await expect(setContributionExtras(ids.c1!, [ids.semi!, ids.pub!])).rejects.toThrow(/one extra per group/);
    await setContributionExtras(ids.c1!, [ids.semi!, ids.first!]);
    const [row] = await getSessionIntensity(ids.s1!);
    expect(row!.extraIds.sort()).toEqual([ids.semi, ids.first].sort());
  });

  it("stores an act's extras as departures from the session's", async () => {
    await setContributionAct(ids.c1!, ids.act1!, true);
    const actId = (await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: ids.c1 } })).id;
    // This act: public instead of semi, without first time
    await setContributionActExtras(actId, [ids.pub!]);
    const overrides = await prisma.contributionActExtra.findMany({ where: { contributionActId: actId }, orderBy: { mode: "asc" } });
    expect(overrides.map((o) => [o.mode, o.extraId])).toEqual(
      expect.arrayContaining([["ADD", ids.pub], ["DROP", ids.semi], ["DROP", ids.first]]),
    );
    // Back to the session's extras: no departures
    await setContributionActExtras(actId, [ids.semi!, ids.first!]);
    expect(await prisma.contributionActExtra.count({ where: { contributionActId: actId } })).toBe(0);
  });
});

describe("session merge", () => {
  it("re-points a contribution the surviving session lacks, with its acts and extras", async () => {
    const c = await contribution("s2", "carl");
    await setContributionExtras(c, [ids.pub!]);
    await setContributionAct(c, ids.act2!, true);
    ids.s3 = (await prisma.session.create({ data: { name: `${RUN} three` } })).id;
    await mergeSessionsRecord(ids.s3!, ids.s2!);
    const moved = await prisma.sessionContribution.findUniqueOrThrow({
      where: { id: c },
      select: { sessionId: true, intensityActs: { select: { actId: true } }, intensityExtras: { select: { extraId: true } } },
    });
    expect(moved).toEqual({ sessionId: ids.s3, intensityActs: [{ actId: ids.act2 }], intensityExtras: [{ extraId: ids.pub }] });
  });

  it("merges into the same person and role: missing acts come over, the target's group choice stays", async () => {
    const target = await contribution("s3", "anna");
    await setContributionExtras(target, [ids.semi!]);
    await setContributionAct(target, ids.act1!, true);
    const s4 = (await prisma.session.create({ data: { name: `${RUN} four` } })).id;
    ids.s4 = s4;
    const source = (await prisma.sessionContribution.create({ data: { sessionId: s4, personId: ids.anna!, roleDefinitionId: "crd_model" } })).id;
    await setContributionExtras(source, [ids.pub!, ids.first!]);
    await setContributionAct(source, ids.act1!, true);
    await setContributionAct(source, ids.act2!, true);
    const sourceAct1 = await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: source, actId: ids.act1 } });
    await setContributionActNote(sourceAct1.id, "  first time on a beach  ");

    await mergeSessionsRecord(ids.s3!, s4);
    const merged = await prisma.sessionContribution.findUniqueOrThrow({
      where: { id: target },
      select: { intensityActs: { select: { actId: true } }, intensityExtras: { select: { extraId: true } } },
    });
    expect(merged.intensityActs.map((a) => a.actId).sort()).toEqual([ids.act1, ids.act2].sort());
    expect(merged.intensityExtras.map((e) => e.extraId).sort()).toEqual([ids.semi, ids.first].sort());
    // The surviving act had no note: the merged-in one's comes along, trimmed
    const kept = await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: target, actId: ids.act1 } });
    expect(kept.notes).toBe("first time on a beach");
  });
});

describe("several people, undo, same as", () => {
  it("ticks for several, restores an act with its note and departures, copies from another", async () => {
    const { setContributionsAct, setContributionsExtras, restoreContributionActs, copyContributionIntensity, getContributionsSessionId } =
      await import("@/lib/services/intensity-service");
    const s5 = (await prisma.session.create({ data: { name: `${RUN} five` } })).id;
    const x = (await prisma.sessionContribution.create({ data: { sessionId: s5, personId: ids.anna!, roleDefinitionId: "crd_model" } })).id;
    const y = (await prisma.sessionContribution.create({ data: { sessionId: s5, personId: ids.bea!, roleDefinitionId: "crd_model" } })).id;
    expect(await getContributionsSessionId([x, y])).toBe(s5);
    await expect(getContributionsSessionId([x, ids.c1!])).rejects.toThrow(/share one session/);

    await setContributionsAct([x, y], ids.act1!, true);
    await setContributionsAct([x, y], ids.act1!, true); // twice is harmless
    expect(await prisma.contributionAct.count({ where: { contributionId: { in: [x, y] } } })).toBe(2);
    await setContributionsExtras([{ contributionId: x, extraIds: [ids.pub!] }, { contributionId: y, extraIds: [ids.semi!] }]);

    await setContributionsAct([x], ids.act1!, false);
    await restoreContributionActs([{ contributionId: x, actId: ids.act1!, notes: "back", overrides: [{ extraId: ids.first!, mode: "ADD" }] }]);
    const back = await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: x, actId: ids.act1 }, include: { extras: true } });
    expect(back.notes).toBe("back");
    expect(back.extras.map((e) => [e.mode, e.extraId])).toEqual([["ADD", ids.first]]);

    // Same as x: y takes x's extras; it already had act1, which stays its own
    await setContributionsAct([x], ids.act2!, true);
    await copyContributionIntensity(x, y);
    const yNow = await prisma.sessionContribution.findUniqueOrThrow({
      where: { id: y },
      select: { intensityExtras: { select: { extraId: true } }, intensityActs: { select: { actId: true, notes: true, extras: true } } },
    });
    expect(yNow.intensityExtras.map((e) => e.extraId)).toEqual([ids.pub]);
    expect(yNow.intensityActs.map((a) => a.actId).sort()).toEqual([ids.act1, ids.act2].sort());
    expect(yNow.intensityActs.find((a) => a.actId === ids.act1)!.extras).toEqual([]); // not overwritten
  });
});

describe("photos as evidence (slice 3b)", () => {
  const photo = async (session: string, n: string) =>
    (
      await prisma.mediaItem.create({
        data: { sessionId: session, mediaType: "PHOTO", filename: `${RUN}-${n}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1 },
      })
    ).id;

  it("links photos of the act's session only; unticking takes them along, undo brings them back; a merge keeps them", async () => {
    const { setActsEvidence, setActEvidence, setContributionsAct, restoreContributionActs, getContributionActsSessionId } = await import(
      "@/lib/services/intensity-service"
    );
    const s6 = (await prisma.session.create({ data: { name: `${RUN} six` } })).id;
    const s7 = (await prisma.session.create({ data: { name: `${RUN} seven` } })).id;
    const c = (await prisma.sessionContribution.create({ data: { sessionId: s6, personId: ids.anna!, roleDefinitionId: "crd_model" } })).id;
    const [p1, p2, elsewhere] = [await photo(s6, "p1"), await photo(s6, "p2"), await photo(s7, "x")];
    await setContributionsAct([c], ids.act1!, true);
    const ca = (await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: c } })).id;
    expect(await getContributionActsSessionId([ca])).toBe(s6);

    await setActsEvidence([ca], [p1, p2, elsewhere], true);
    await setActsEvidence([ca], [p1], true); // twice is harmless
    let rows = await getSessionIntensity(s6);
    expect(rows[0]!.acts[0]!.mediaIds.sort()).toEqual([p1, p2].sort()); // the other session's photo is not evidence here

    await setActsEvidence([ca], [p2], false);
    await setActEvidence(ca, [p2]); // the picker replaces
    rows = await getSessionIntensity(s6);
    expect(rows[0]!.acts[0]!.mediaIds).toEqual([p2]);

    await setContributionsAct([c], ids.act1!, false);
    expect(await prisma.contributionActMedia.count({ where: { mediaItemId: p2 } })).toBe(0);
    await restoreContributionActs([{ contributionId: c, actId: ids.act1!, notes: null, overrides: [], mediaIds: [p2] }]);
    rows = await getSessionIntensity(s6);
    expect(rows[0]!.acts[0]!.mediaIds).toEqual([p2]);

    // Merge into a session where Anna ticked the same act: the photo joins the act that stays
    const target = (await prisma.sessionContribution.create({ data: { sessionId: s7, personId: ids.anna!, roleDefinitionId: "crd_model" } })).id;
    await setContributionsAct([target], ids.act1!, true);
    await mergeSessionsRecord(s7, s6);
    const kept = await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: target, actId: ids.act1 }, include: { media: true } });
    expect(kept.media.map((m) => m.mediaItemId)).toEqual([p2]);

    // A deleted photo is evidence no more
    await prisma.mediaItem.delete({ where: { id: p2 } });
    expect(await prisma.contributionActMedia.count({ where: { contributionActId: kept.id } })).toBe(0);
  });
});
