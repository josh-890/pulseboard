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
  const persons = [ids.anna, ids.bea, ids.carl, ids.dora, ids.erin].filter(Boolean) as string[];
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
    expect(rows[0]!.suggestedScenarioIds).toEqual(["dsit-solo"]);

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

describe("intensity in the query (slice 4)", () => {
  it("compares a session's, a set's, a person's peak and an image's act value — overall and within a scenario", async () => {
    const { resolveTagFilterParam, findTagMatchIds } = await import("@/lib/services/tag-filter-service");
    const { setContributionsAct, setActsEvidence, getPersonIntensity } = await import("@/lib/services/intensity-service");
    const max = await prisma.intensityExtra.findFirst({ where: { isMax: true } });
    if (!max) throw new Error("the catalog has no Max extra");
    await person("dora", "female");
    const s8 = (await prisma.session.create({ data: { name: `${RUN} eight`, date: new Date("2020-01-01"), datePrecision: "DAY" } })).id;
    const s9 = (await prisma.session.create({ data: { name: `${RUN} nine`, date: new Date("2020-02-01"), datePrecision: "DAY" } })).id;
    const c8 = (await prisma.sessionContribution.create({ data: { sessionId: s8, personId: ids.dora!, roleDefinitionId: "crd_model" } })).id;
    const c9 = (await prisma.sessionContribution.create({ data: { sessionId: s9, personId: ids.dora!, roleDefinitionId: "crd_model" } })).id;
    // s8: semi + first time; act one goes public instead and drops first time → 3 + 2 = 5; act two inherits → 5 + 1 + 1 = 7
    await setContributionExtras(c8, [ids.semi!, ids.first!]);
    await setContributionsAct([c8], ids.act1!, true);
    await setContributionsAct([c8], ids.act2!, true);
    const one = (await prisma.contributionAct.findFirstOrThrow({ where: { contributionId: c8, actId: ids.act1 } })).id;
    await setContributionActExtras(one, [ids.pub!]);
    // s9: Max, nothing ticked → 10 overall, nothing within a scenario
    await setContributionExtras(c9, [max.id]);
    const photo = (
      await prisma.mediaItem.create({
        data: { sessionId: s8, mediaType: "PHOTO", filename: `${RUN}-q.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1 },
      })
    ).id;
    await setActsEvidence([one], [photo], true);
    const set = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set` } })).id;
    await prisma.setSession.create({ data: { setId: set, sessionId: s8 } });

    const match = async (entity: "SESSION" | "SET" | "PERSON" | "MEDIA_ITEM", text: string, within: string[]) => {
      const filter = await resolveTagFilterParam(text, entity);
      if (!filter) throw new Error("empty filter");
      expect(filter.problems).toEqual([]);
      return (await findTagMatchIds(entity, filter.resolved, within)).sort();
    };
    const sc = `intensity:"${RUN} scenario`;
    try {
      expect(await match("SESSION", "intensity>=7", [s8, s9])).toEqual([s8, s9].sort());
      expect(await match("SESSION", "intensity>7", [s8, s9])).toEqual([s9]);
      expect(await match("SESSION", "intensity:7", [s8, s9])).toEqual([s8]);
      expect(await match("SESSION", `${sc}>=7"`, [s8, s9])).toEqual([s8]);
      expect(await match("SESSION", `${sc}>7"`, [s8, s9])).toEqual([]);
      expect(await match("SET", "intensity>=7", [set])).toEqual([set]);
      expect(await match("SET", "intensity>7", [set])).toEqual([]);
      expect(await match("MEDIA_ITEM", "intensity=5", [photo])).toEqual([photo]);
      expect(await match("MEDIA_ITEM", "intensity>=6", [photo])).toEqual([]);
      expect(await match("PERSON", "intensity>=10", [ids.dora!])).toEqual([ids.dora]);
      expect(await match("PERSON", `${sc}=7"`, [ids.dora!])).toEqual([ids.dora]);
      expect(await match("PERSON", "intensity<10", [ids.dora!])).toEqual([]); // the peak, not any session

      // The SQL agrees with the person's tab
      const summary = await getPersonIntensity(ids.dora!);
      expect(summary.peak?.value).toBe(10);
      expect(summary.scenarioPeaks[ids.scenario!]?.value).toBe(7);

      const bad = await resolveTagFilterParam("intensity:Nope-Nothing>=3 intensity>=x", "SESSION");
      expect(bad!.problems).toEqual(["No scenario “Nope-Nothing”", "Cannot read “intensity>=x”"]);
    } finally {
      await prisma.setSession.deleteMany({ where: { setId: set } });
      await prisma.set.delete({ where: { id: set } });
    }
  });
});

describe("negative points in the query (2026-10-23)", () => {
  it("take off in SQL as in the app, and never below 0", async () => {
    const { resolveTagFilterParam, findTagMatchIds } = await import("@/lib/services/tag-filter-service");
    const { setContributionsAct } = await import("@/lib/services/intensity-service");
    const calm = (await prisma.intensityExtra.create({ data: { name: `${RUN} familiar`, points: -1 } })).id;
    const deep = (await prisma.intensityExtra.create({ data: { name: `${RUN} very familiar`, points: -5 } })).id;
    const s = (await prisma.session.create({ data: { name: `${RUN} calm` } })).id;
    const t = (await prisma.session.create({ data: { name: `${RUN} deep` } })).id;
    const ca = (await prisma.sessionContribution.create({ data: { sessionId: s, personId: ids.anna!, roleDefinitionId: "crd_model" } })).id;
    const cb = (await prisma.sessionContribution.create({ data: { sessionId: t, personId: ids.anna!, roleDefinitionId: "crd_model" } })).id;
    await setContributionExtras(ca, [calm]); // act two (5) − 1 = 4
    await setContributionsAct([ca], ids.act2!, true);
    await setContributionExtras(cb, [deep]); // act one (3) − 5 → 0
    await setContributionsAct([cb], ids.act1!, true);
    const match = async (text: string) => {
      const filter = (await resolveTagFilterParam(text, "SESSION"))!;
      return (await findTagMatchIds("SESSION", filter.resolved, [s, t])).sort();
    };
    expect(await match("intensity:4")).toEqual([s]);
    expect(await match("intensity>=4.5")).toEqual([]);
    expect(await match("intensity:0")).toEqual([t]);
    expect(await match("intensity<0")).toEqual([]);
    const rows = await getSessionIntensity(t);
    expect(rows[0]!.acts).toHaveLength(1);
  });
});

describe("extras for some scenarios only (2026-10-23)", () => {
  it("an extra turned off for the act's scenario does not count — in SQL, on the person, in the panel", async () => {
    const { resolveTagFilterParam, findTagMatchIds } = await import("@/lib/services/tag-filter-service");
    const { setContributionsAct, getPersonIntensity } = await import("@/lib/services/intensity-service");
    const { setIntensityGroupScenariosOff, setIntensityExtraScenariosOff, getIntensityCatalog } = await import(
      "@/lib/services/intensity-catalog-service"
    );
    const { personView } = await import("@/components/sessions/intensity/panel-state");
    await person("erin", "female");
    const s = (await prisma.session.create({ data: { name: `${RUN} scoped`, date: new Date("2021-01-01"), datePrecision: "DAY" } })).id;
    const c = (await prisma.sessionContribution.create({ data: { sessionId: s, personId: ids.erin!, roleDefinitionId: "crd_model" } })).id;
    await setContributionExtras(c, [ids.semi!, ids.first!]); // act two 5 + semi 1 + first 1 = 7
    await setContributionsAct([c], ids.act2!, true);
    const match = async (text: string) => {
      const filter = (await resolveTagFilterParam(text, "SESSION"))!;
      return (await findTagMatchIds("SESSION", filter.resolved, [s])).sort();
    };
    const panel = async () => {
      const cat = await getIntensityCatalog();
      const sc = cat.scenarios.find((x) => x.id === ids.scenario)!;
      const acts = new Map(sc.acts.map((a) => [a.id, { level: a.level, name: a.name, scenarioId: sc.id, scenario: sc.name }]));
      const view = personView(
        { extraIds: [ids.semi!, ids.first!], acts: [{ id: "x", actId: ids.act2!, notes: null, overrides: [], mediaIds: [] }] },
        { scenarios: [], groups: cat.groups, extras: cat.extras, max: cat.max },
        acts,
      );
      return view.ticked.get(ids.act2!)!;
    };
    try {
      expect(await match("intensity:7")).toEqual([s]);
      expect((await panel()).value).toBe(7);

      await setIntensityGroupScenariosOff(ids.group!, [ids.scenario!]); // the group's extras (semi) not here
      expect(await match("intensity:6")).toEqual([s]);
      expect((await panel()).value).toBe(6);
      expect((await panel()).explain).toContain(`(${RUN} semi — not in ${RUN} scenario)`);

      await setIntensityExtraScenariosOff(ids.first!, [ids.scenario!]); // and the free one
      expect(await match("intensity:5")).toEqual([s]);
      expect((await panel()).value).toBe(5);
      const p = await getPersonIntensity(ids.erin!);
      expect(p.peak?.value).toBe(5);

      await expect(setIntensityExtraScenariosOff(ids.semi!, [ids.scenario!])).rejects.toThrow("set it on the group");
    } finally {
      await setIntensityGroupScenariosOff(ids.group!, []);
      await setIntensityExtraScenariosOff(ids.first!, []);
    }
    expect(await match("intensity:7")).toEqual([s]);
  });
});
