import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getSessionIntensity, setContributionAct } from "@/lib/services/intensity-service";
import { predicateSql } from "@/lib/services/tag-predicates";
import { bulkShowPersons, setShownSupport } from "@/lib/services/appearance-service";
import { getCareerTimeline } from "@/lib/services/career-service";
import { rebuildSetParticipantsFromContributions, setContributionRole } from "@/lib/services/contribution-service";
import type { ResolvedPredicate } from "@/lib/tag-query/types";
import type { TaggableEntity } from "@/lib/tag-domains";

// The support role "Appearance" (2026-10-24): on camera, but only appearing —
// no intensity, not in person: filters (cast: takes them in), shown on an image
// only where marked, listed apart in the career ("Appears in").
const RUN = `sup${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function person(key: string) {
  ids[key] = (await prisma.person.create({ data: { icgId: `${RUN}-${key}`.toUpperCase(), sexAtBirth: "female" } })).id;
  await prisma.personAlias.create({ data: { personId: ids[key]!, name: `${RUN} ${key}`, isCommon: true } });
}

async function matches(entity: TaggableEntity, p: ResolvedPredicate, id: string): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT (${predicateSql(entity, p, Prisma.sql`${id}`)}) AS ok`;
  return row!.ok;
}

beforeAll(async () => {
  await person("model");
  await person("guest");
  ids.session = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  ids.set = (await prisma.set.create({ data: { type: "photo", title: `${RUN} set` } })).id;
  await prisma.setSession.create({ data: { setId: ids.set!, sessionId: ids.session!, isPrimary: true } });
  ids.cModel = (await prisma.sessionContribution.create({ data: { sessionId: ids.session!, personId: ids.model!, roleDefinitionId: "crd_model" } })).id;
  ids.cGuest = (await prisma.sessionContribution.create({ data: { sessionId: ids.session!, personId: ids.guest!, roleDefinitionId: "crd_appearance" } })).id;
  await prisma.$transaction((tx) => rebuildSetParticipantsFromContributions(tx, ids.set!));
  ids.photo = (
    await prisma.mediaItem.create({
      data: { sessionId: ids.session!, mediaType: "PHOTO", filename: `${RUN}.jpg`, mimeType: "image/jpeg", size: 1, originalWidth: 1, originalHeight: 1 },
    })
  ).id;
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} scenario`, sortOrder: 99 } })).id;
  ids.act = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "one", level: 3 } })).id;
});

afterAll(async () => {
  const persons = [ids.model, ids.guest].filter(Boolean) as string[];
  await prisma.setParticipant.deleteMany({ where: { setId: ids.set } });
  await prisma.setSession.deleteMany({ where: { setId: ids.set } });
  await prisma.set.deleteMany({ where: { id: ids.set } });
  await prisma.sessionContribution.deleteMany({ where: { personId: { in: persons } } });
  await prisma.mediaItem.deleteMany({ where: { filename: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.personAlias.deleteMany({ where: { personId: { in: persons } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("the support role", () => {
  it("is seeded on camera with presence SUPPORT, Model stays LEAD", async () => {
    const roles = await prisma.contributionRoleDefinition.findMany({
      where: { id: { in: ["crd_model", "crd_appearance"] } },
      select: { id: true, presence: true, group: { select: { kind: true } } },
      orderBy: { id: "asc" },
    });
    expect(roles.map((r) => [r.id, r.presence, r.group.kind])).toEqual([
      ["crd_appearance", "SUPPORT", "ON_CAMERA"],
      ["crd_model", "LEAD", "ON_CAMERA"],
    ]);
  });

  it("carries no intensity: the panel lists the model only, the suggestion is solo", async () => {
    const rows = await getSessionIntensity(ids.session!);
    expect(rows.map((r) => r.person.name)).toEqual([`${RUN} model`]);
    expect(rows[0]!.suggestedScenarioIds).toEqual(["dsit-solo"]);
  });

  it("person: is the leads, cast: takes the support in — on sets and sessions", async () => {
    for (const [entity, id] of [["SET", ids.set], ["SESSION", ids.session]] as const) {
      expect(await matches(entity, { kind: "person", personIds: [ids.model!] }, id!)).toBe(true);
      expect(await matches(entity, { kind: "person", personIds: [ids.guest!] }, id!)).toBe(false);
      expect(await matches(entity, { kind: "cast", personIds: [ids.guest!] }, id!)).toBe(true);
    }
  });

  it("an image shows the support only where marked — and person: still leaves them out", async () => {
    const cast: ResolvedPredicate = { kind: "cast", personIds: [ids.guest!] };
    expect(await matches("MEDIA_ITEM", { kind: "person", personIds: [ids.model!] }, ids.photo!)).toBe(true);
    expect(await matches("MEDIA_ITEM", cast, ids.photo!)).toBe(false);
    await setShownSupport(ids.photo!, [ids.guest!]);
    expect(await matches("MEDIA_ITEM", cast, ids.photo!)).toBe(true);
    expect(await matches("MEDIA_ITEM", { kind: "person", personIds: [ids.guest!] }, ids.photo!)).toBe(false);
    await setShownSupport(ids.photo!, []);
    expect(await matches("MEDIA_ITEM", cast, ids.photo!)).toBe(false);
  });

  it("bulk show marks the support only where they are support", async () => {
    await bulkShowPersons([ids.photo!], [ids.guest!, ids.model!]);
    const rows = await prisma.mediaItemShownPerson.findMany({ where: { mediaItemId: ids.photo }, select: { personId: true } });
    expect(rows.map((r) => r.personId)).toEqual([ids.guest]);
    await setShownSupport(ids.photo!, []);
  });

  it("the career lists the set under Appears in, not the career", async () => {
    expect((await getCareerTimeline(ids.guest!, { scope: "all" })).filter((r) => r.kind === "promoted")).toEqual([]);
    const appears = await getCareerTimeline(ids.guest!, { presence: "SUPPORT" });
    expect(appears.map((r) => r.title)).toEqual([`${RUN} set`]);
    const model = await getCareerTimeline(ids.model!, { scope: "all" });
    expect(model.map((r) => r.title)).toEqual([`${RUN} set`]);
  });

  it("switching to Appearance drops the acts and updates the set's cast", async () => {
    await setContributionAct(ids.cModel!, ids.act!, true);
    const res = await setContributionRole(ids.cModel!, "crd_appearance");
    expect(res.droppedActs).toBe(1);
    expect(await prisma.contributionAct.count({ where: { contributionId: ids.cModel } })).toBe(0);
    const sp = await prisma.setParticipant.findMany({ where: { setId: ids.set }, select: { roleDefinitionId: true } });
    expect(sp.map((p) => p.roleDefinitionId)).toEqual(["crd_appearance", "crd_appearance"]);
    // And back — nothing to drop
    expect((await setContributionRole(ids.cModel!, "crd_model")).droppedActs).toBe(0);
  });

  it("refuses a switch off camera", async () => {
    await expect(setContributionRole(ids.cGuest!, "crd_photographer")).rejects.toThrow(/on-camera/);
  });
});
