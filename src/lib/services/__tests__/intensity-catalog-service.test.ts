import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createIntensityAct,
  createIntensityBoundary,
  deleteIntensityBoundary,
  updateIntensityBoundary,
  getIntensityCatalog,
  getIntensityMax,
  setIntensityMax,
  moveIntensityActs,
  renameIntensityScenario,
  updateIntensityAct,
  updateIntensityExtra,
} from "@/lib/services/intensity-catalog-service";

// Catalog edits that reach into the rest of the system (2026-10-23, K0): a group
// keeps one extra per person and act, and a rename carries saved queries along.
const RUN = `icv${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  ids.person = (await prisma.person.create({ data: { icgId: `${RUN}-p`.toUpperCase(), sexAtBirth: "female" } })).id;
  ids.session = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  ids.c = (
    await prisma.sessionContribution.create({
      data: { sessionId: ids.session, personId: ids.person, roleDefinitionId: "crd_model" },
    })
  ).id;
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} Scene`, sortOrder: 99 } })).id;
  ids.act = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario, name: `${RUN} Toys`, level: 4 } })).id;
  ids.group = (await prisma.intensityExtraGroup.create({ data: { name: `${RUN} where` } })).id;
  ids.pub = (await prisma.intensityExtra.create({ data: { name: `${RUN} public`, points: 2, groupId: ids.group } })).id;
  ids.night = (await prisma.intensityExtra.create({ data: { name: `${RUN} night`, points: 1 } })).id;
  ids.rain = (await prisma.intensityExtra.create({ data: { name: `${RUN} rain`, points: 1 } })).id;
});

afterAll(async () => {
  await prisma.savedFilter.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.sessionContribution.deleteMany({ where: { personId: ids.person } });
  await prisma.session.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.person.deleteMany({ where: { id: ids.person } });
  await prisma.intensityExtra.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityExtraGroup.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("an extra moved into a group", () => {
  it("is refused while a person in a session holds it beside another extra of that group", async () => {
    await prisma.contributionExtra.createMany({
      data: [
        { contributionId: ids.c!, extraId: ids.pub! },
        { contributionId: ids.c!, extraId: ids.night! },
      ],
    });
    await expect(updateIntensityExtra(ids.night!, { groupId: ids.group! })).rejects.toThrow(
      `another ${RUN} where extra once`,
    );
    await updateIntensityExtra(ids.rain!, { groupId: ids.group! }); // nobody holds rain
    expect((await prisma.intensityExtra.findUnique({ where: { id: ids.rain! } }))?.groupId).toBe(ids.group);
    await updateIntensityExtra(ids.rain!, { groupId: null });
    await prisma.contributionExtra.deleteMany({ where: { contributionId: ids.c! } });
  });

  it("is refused while an act adds it beside another extra of that group", async () => {
    const ca = await prisma.contributionAct.create({ data: { contributionId: ids.c!, actId: ids.act! } });
    await prisma.contributionActExtra.createMany({
      data: [
        { contributionActId: ca.id, extraId: ids.pub!, mode: "ADD" },
        { contributionActId: ca.id, extraId: ids.night!, mode: "ADD" },
      ],
    });
    await expect(updateIntensityExtra(ids.night!, { groupId: ids.group! })).rejects.toThrow("take one of them off first");
    // A DROP of the other one is no clash
    await prisma.contributionActExtra.update({
      where: { contributionActId_extraId: { contributionActId: ca.id, extraId: ids.pub! } },
      data: { mode: "DROP" },
    });
    await updateIntensityExtra(ids.night!, { groupId: ids.group! });
    await updateIntensityExtra(ids.night!, { groupId: null });
    await prisma.contributionAct.delete({ where: { id: ca.id } });
  });
});

describe("a rename carries saved queries along", () => {
  it("rewrites act: and intensity: in saved filters and Smart Collections, nothing else", async () => {
    const save = (scope: string, name: string, tags: string) =>
      prisma.savedFilter.create({
        data: { scope, name: `${RUN} ${name}`, params: new URLSearchParams({ q: "x", tags }).toString() },
      });
    const media = await save("media", "media", `beach act:"${RUN} Toys"`);
    const sessions = await save("sessions", "sessions", `intensity:"${RUN} Scene>=4"`);
    const other = await save("people", "other", "act:Elsewhere");

    await updateIntensityAct(ids.act!, { name: `${RUN} Toys, big` });
    await renameIntensityScenario(ids.scenario!, `${RUN} Stage`);

    const tags = async (id: string) =>
      new URLSearchParams((await prisma.savedFilter.findUniqueOrThrow({ where: { id } })).params);
    expect((await tags(media.id)).get("tags")).toBe(`beach act:"${RUN} Toys, big"`);
    expect((await tags(media.id)).get("q")).toBe("x");
    expect((await tags(sessions.id)).get("tags")).toBe(`intensity:"${RUN} Stage>=4"`);
    expect((await tags(other.id)).get("tags")).toBe("act:Elsewhere");
  });
});

describe("moving acts on the board (K1)", () => {
  const cell = async (scenarioId: string, level: number) =>
    (
      await prisma.intensityAct.findMany({
        where: { scenarioId, level },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { name: true },
      })
    ).map((a) => a.name.replace(`${RUN} `, ""));

  it("puts acts before another or at the end, across scenario and level, and renumbers the cell", async () => {
    const other = (await prisma.intensityScenario.create({ data: { name: `${RUN} Other`, sortOrder: 98 } })).id;
    const a = await createIntensityAct(other, `${RUN} a`, 2);
    const b = await createIntensityAct(other, `${RUN} b`, 2);
    const c = await createIntensityAct(other, `${RUN} c`, 2);
    expect(await cell(other, 2)).toEqual(["a", "b", "c"]); // new ones at the end

    await moveIntensityActs([c.id], { scenarioId: other, level: 2, beforeId: a.id });
    expect(await cell(other, 2)).toEqual(["c", "a", "b"]);

    // Into another scenario and level, before an act there; ticks stay with the act
    const tick = await prisma.contributionAct.create({ data: { contributionId: ids.c!, actId: a.id } });
    const d = await createIntensityAct(ids.scenario!, `${RUN} d`, 4.5);
    await moveIntensityActs([a.id], { scenarioId: ids.scenario!, level: 4.5, beforeId: d.id });
    expect(await cell(ids.scenario!, 4.5)).toEqual(["a", "d"]);
    expect(await cell(other, 2)).toEqual(["c", "b"]);
    expect((await prisma.contributionAct.findUniqueOrThrow({ where: { id: tick.id } })).actId).toBe(a.id);
    await prisma.contributionAct.delete({ where: { id: tick.id } });

    // Several at once keep their given order, at the end
    await moveIntensityActs([b.id, c.id], { scenarioId: ids.scenario!, level: 4.5, beforeId: null });
    expect(await cell(ids.scenario!, 4.5)).toEqual(["a", "d", "b", "c"]);
  });

  it("refuses a name the target scenario already has, and a level above 9.5", async () => {
    const third = (await prisma.intensityScenario.create({ data: { name: `${RUN} Third`, sortOrder: 97 } })).id;
    const twin = await createIntensityAct(third, `${RUN} d`, 1);
    await expect(moveIntensityActs([twin.id], { scenarioId: ids.scenario!, level: 1, beforeId: null })).rejects.toThrow(
      `already has “${RUN} d”`,
    );
    await expect(moveIntensityActs([twin.id], { scenarioId: third, level: 10, beforeId: null })).rejects.toThrow("up to 9.5");
  });
});

describe("the top of the scale (2026-10-23)", () => {
  it("rises with the Max row's text, lets levels up to half a step below, and is refused lower while acts sit above", async () => {
    const before = await getIntensityMax();
    const maxRow = await prisma.intensityScaleStep.findUnique({ where: { value: before } });
    const scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} Top`, sortOrder: 96 } })).id;
    try {
      await setIntensityMax(before + 2);
      expect(await getIntensityMax()).toBe(before + 2);
      expect((await getIntensityCatalog()).max).toBe(before + 2);
      if (maxRow) {
        expect(await prisma.intensityScaleStep.findUnique({ where: { value: before + 2 } })).toMatchObject({ title: maxRow.title });
      }
      const high = await createIntensityAct(scenario, `${RUN} high`, before + 1.5);
      await expect(createIntensityAct(scenario, `${RUN} too high`, before + 2)).rejects.toThrow("only Max reaches");

      await expect(setIntensityMax(before)).rejects.toThrow(`${RUN} high (${RUN} Top, ${before + 1.5})`);
      await expect(setIntensityMax(2)).rejects.toThrow("whole number from 3 to 20");
      await expect(setIntensityMax(10.5)).rejects.toThrow("whole number");
      await prisma.intensityAct.delete({ where: { id: high.id } });
    } finally {
      await setIntensityMax(before);
      await prisma.intensityScenario.delete({ where: { id: scenario } });
    }
    expect(await getIntensityMax()).toBe(before);
    if (maxRow) expect(await prisma.intensityScaleStep.findUnique({ where: { value: before } })).toMatchObject({ title: maxRow.title });
  });
});

describe("boundaries between levels (2026-10-23)", () => {
  it("sit on a seam once, from 0.5 up to Max; title required; they block a lower Max", async () => {
    const max = await getIntensityMax();
    // A seam no real boundary of this tenant uses: the highest free half step
    const used = new Set((await prisma.intensityBoundary.findMany({ select: { value: true } })).map((b) => b.value));
    let at = max;
    while (used.has(at)) at -= 0.5;
    const b = await createIntensityBoundary(at, `  ${RUN} Shame  `);
    try {
      expect(b).toMatchObject({ value: at, title: `${RUN} Shame`, description: null });
      expect((await getIntensityCatalog()).boundaries.map((x) => x.value)).toContain(at);
      await expect(createIntensityBoundary(at, `${RUN} again`)).rejects.toThrow(`There is a boundary at`);
      await expect(createIntensityBoundary(0, `${RUN} zero`)).rejects.toThrow("from 0.5 up to");
      await expect(createIntensityBoundary(max + 0.5, `${RUN} over`)).rejects.toThrow("from 0.5 up to");
      await expect(createIntensityBoundary(2.3, `${RUN} off`)).rejects.toThrow("half steps");
      await expect(createIntensityBoundary(at - 0.5 > 0 ? at - 0.5 : 0.5, "  ")).rejects.toThrow("Name is required");

      await updateIntensityBoundary(b.id, { description: "  Here she gives up shame  " });
      expect(await prisma.intensityBoundary.findUnique({ where: { id: b.id } })).toMatchObject({
        title: `${RUN} Shame`,
        description: "Here she gives up shame",
      });
      await updateIntensityBoundary(b.id, { description: "" });
      expect((await prisma.intensityBoundary.findUnique({ where: { id: b.id } }))!.description).toBeNull();

      if (at > 3) await expect(setIntensityMax(Math.floor(at - 0.5) >= 3 ? Math.floor(at - 0.5) : 3)).rejects.toThrow(`${RUN} Shame (`);
    } finally {
      await deleteIntensityBoundary(b.id);
    }
    expect(await prisma.intensityBoundary.findUnique({ where: { id: b.id } })).toBeNull();
  });
});

describe("the order of extras (2026-10-23)", () => {
  it("runs by points, then name — however they were added", async () => {
    const g = (await prisma.intensityExtraGroup.create({ data: { name: `${RUN} order` } })).id;
    await prisma.intensityExtra.createMany({
      data: [
        { name: `${RUN} o-public`, points: 2, groupId: g, sortOrder: 0 },
        { name: `${RUN} o-private`, points: 0, groupId: g, sortOrder: 1 },
        { name: `${RUN} o-b-semi`, points: 1, groupId: g, sortOrder: 2 },
        { name: `${RUN} o-a-semi`, points: 1, groupId: g, sortOrder: 3 },
      ],
    });
    const names = (await getIntensityCatalog()).extras.filter((e) => e.groupId === g).map((e) => e.name.replace(`${RUN} o-`, ""));
    expect(names).toEqual(["private", "a-semi", "b-semi", "public"]);
  });
});

describe("an extra's points (2026-10-23)", () => {
  it("go below zero in half steps", async () => {
    await updateIntensityExtra(ids.rain!, { points: -1.5 });
    expect((await prisma.intensityExtra.findUniqueOrThrow({ where: { id: ids.rain! } })).points).toBe(-1.5);
    await expect(updateIntensityExtra(ids.rain!, { points: -1.3 })).rejects.toThrow("steps of 0.5");
    await expect(updateIntensityExtra(ids.rain!, { points: -21 })).rejects.toThrow("from −20 to +20");
    await updateIntensityExtra(ids.rain!, { points: 1 });
  });
});
