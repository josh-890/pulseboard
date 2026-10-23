import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
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
