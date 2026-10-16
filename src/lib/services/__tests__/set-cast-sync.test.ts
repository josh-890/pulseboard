import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rebuildSetParticipantsFromContributions } from "@/lib/services/contribution-service";
import { BEHIND_CAMERA_GROUP } from "@/lib/services/session-contributors";

// A promoted staging set follows its Set's cast (2026-10-17): "City Of Beauty" was
// staged with one Alisa, the Set recast to another, and the staged sets view kept
// listing it under the first. Runs against the DEV database; rows carry RUN.

const RUN = `csy${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function person(key: string, alias: string) {
  const p = await prisma.person.create({ data: { icgId: `${RUN}-${key}`.toUpperCase() } });
  await prisma.personAlias.create({ data: { personId: p.id, name: alias, isCommon: true } });
  ids[key] = p.id;
  ids[`icg:${key}`] = p.icgId;
}

const rebuild = () => prisma.$transaction((tx) => rebuildSetParticipantsFromContributions(tx, ids.set));
const staged = (key: string) => prisma.stagingSet.findUniqueOrThrow({ where: { id: ids[key] } });

beforeAll(async () => {
  await person("gold", "Alisa");
  await person("amore", "Alisa Amore");
  await person("photographer", "Dan");
  ids.onCamera = (await prisma.contributionRoleDefinition.findFirstOrThrow({ where: { group: { name: { not: BEHIND_CAMERA_GROUP } } } })).id;
  ids.behind = (await prisma.contributionRoleDefinition.findFirstOrThrow({ where: { group: { name: BEHIND_CAMERA_GROUP } } })).id;

  const session = await prisma.session.create({ data: { name: `${RUN} session` } });
  const set = await prisma.set.create({ data: { type: "photo", title: `${RUN} City Of Beauty` } });
  ids.session = session.id;
  ids.set = set.id;
  await prisma.setSession.create({ data: { setId: set.id, sessionId: session.id, isPrimary: true } });
  await prisma.sessionContribution.create({ data: { sessionId: session.id, personId: ids.gold, roleDefinitionId: ids.onCamera } });
  await prisma.sessionContribution.create({ data: { sessionId: session.id, personId: ids.photographer, roleDefinitionId: ids.behind } });

  const gold = { name: "Alisa", icgId: ids["icg:gold"] };
  const promoted = await prisma.stagingSet.create({
    data: {
      title: `${RUN} City Of Beauty`,
      channelName: "ArtOfDanWorld",
      status: "PROMOTED",
      promotedSetId: set.id,
      participants: [{ ...gold, url: "https://example.invalid/alisa" }],
      participantStatuses: [{ ...gold, status: "known", personId: ids.gold }],
      participantIcgIds: [gold.icgId],
      participantNamesNorm: "alisa",
      subjectPersonId: ids.gold,
      subjectIcgId: gold.icgId,
    },
  });
  ids.promoted = promoted.id;
  // Not promoted into the set: never touched
  const pending = await prisma.stagingSet.create({
    data: { title: `${RUN} other`, channelName: "ArtOfDanWorld", participants: [gold], participantIcgIds: [gold.icgId] },
  });
  ids.pending = pending.id;
  await rebuild();
});

afterAll(async () => {
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: RUN } } });
  if (ids.set) {
    await prisma.setParticipant.deleteMany({ where: { setId: ids.set } });
    await prisma.setSession.deleteMany({ where: { setId: ids.set } });
    await prisma.set.delete({ where: { id: ids.set } });
  }
  if (ids.session) {
    await prisma.sessionContribution.deleteMany({ where: { sessionId: ids.session } });
    await prisma.session.delete({ where: { id: ids.session } });
  }
  const people = [ids.gold, ids.amore, ids.photographer].filter(Boolean);
  await prisma.personAlias.deleteMany({ where: { personId: { in: people } } });
  await prisma.person.deleteMany({ where: { id: { in: people } } });
});

describe("syncPromotedStagingCasts", () => {
  it("leaves a staging set alone while it matches the cast — the photographer does not count", async () => {
    const ss = await staged("promoted");
    expect(ss.participantIcgIds).toEqual([ids["icg:gold"]]);
    expect(ss.participants).toEqual([{ name: "Alisa", icgId: ids["icg:gold"], url: "https://example.invalid/alisa" }]);
  });

  it("follows a recast: the new person replaces the old one, subject included", async () => {
    await prisma.sessionContribution.updateMany({
      where: { sessionId: ids.session, personId: ids.gold },
      data: { personId: ids.amore },
    });
    await rebuild();

    const ss = await staged("promoted");
    expect(ss.participantIcgIds).toEqual([ids["icg:amore"]]);
    expect(ss.participants).toEqual([{ name: "Alisa Amore", icgId: ids["icg:amore"] }]);
    expect(ss.participantStatuses).toEqual([{ name: "Alisa Amore", icgId: ids["icg:amore"], status: "known", personId: ids.amore }]);
    expect(ss.participantNamesNorm).toBe("alisa amore");
    expect(ss.subjectPersonId).toBe(ids.amore);
    expect(ss.subjectIcgId).toBe(ids["icg:amore"]);

    const other = await staged("pending");
    expect(other.participantIcgIds).toEqual([ids["icg:gold"]]);
  });

  it("keeps what the import recorded for a person who stays, and adds a co-model", async () => {
    await prisma.stagingSet.update({
      where: { id: ids.promoted },
      data: { participants: [{ name: "Alisa A.", icgId: ids["icg:amore"], url: "https://example.invalid/amore" }] },
    });
    await prisma.sessionContribution.create({ data: { sessionId: ids.session, personId: ids.gold, roleDefinitionId: ids.onCamera } });
    await rebuild();

    const ss = await staged("promoted");
    expect([...ss.participantIcgIds].sort()).toEqual([ids["icg:amore"], ids["icg:gold"]].sort());
    expect(ss.participants).toContainEqual({ name: "Alisa A.", icgId: ids["icg:amore"], url: "https://example.invalid/amore" });
    expect(ss.participants).toContainEqual({ name: "Alisa", icgId: ids["icg:gold"] });
    expect(ss.subjectPersonId).toBe(ids.amore); // still in the cast
  });

  it("does nothing while the set has no one on camera", async () => {
    await prisma.setSession.deleteMany({ where: { setId: ids.set } });
    await rebuild();
    expect((await staged("promoted")).participantIcgIds).toHaveLength(2);
  });
});
