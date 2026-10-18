import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getSessionMergeCandidates, getSessionMergeDirection } from "@/lib/services/session-merge-candidates";
import { mergeSessionsRecord } from "@/lib/services/session-service";
import { BEHIND_CAMERA_GROUP } from "@/lib/services/session-contributors";

// Session merge suggestions (2026-10-18): candidates by shared people, label and
// project, with the reasons; search over set titles, people and labels; the
// older session survives. Runs against the DEV database; throwaway rows carry
// RUN and are removed afterwards.

const RUN = `smc${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function session(key: string, opts: { date?: string; type?: "REFERENCE"; people?: string[]; set?: { title: string; release: string } }) {
  const s = await prisma.session.create({
    // Same unhelpful name on purpose; the description marks it as this run's
    data: { name: key === "refSession" ? `${RUN} reference` : "Set 1", description: RUN, date: opts.date ? new Date(opts.date) : null, type: opts.type ?? "PRODUCTION", datePrecision: "DAY" },
  });
  ids[key] = s.id;
  for (const p of opts.people ?? []) {
    await prisma.sessionContribution.create({ data: { sessionId: s.id, personId: ids[p], roleDefinitionId: ids.onCamera } });
  }
  if (opts.set) {
    const set = await prisma.set.create({
      data: { type: "photo", title: `${RUN} ${opts.set.title}`, channelId: ids.channel, releaseDate: new Date(opts.set.release), releaseDatePrecision: "DAY" },
    });
    ids[`set:${key}`] = set.id;
    await prisma.setSession.create({ data: { setId: set.id, sessionId: s.id, isPrimary: true } });
  }
}

beforeAll(async () => {
  ids.onCamera = (await prisma.contributionRoleDefinition.findFirstOrThrow({ where: { group: { name: { not: BEHIND_CAMERA_GROUP } } } })).id;
  ids.label = (await prisma.label.create({ data: { name: `${RUN} Label` } })).id;
  ids.channel = (await prisma.channel.create({ data: { name: `${RUN} Channel`, labelId: ids.label } })).id;
  for (const [key, alias] of [["anna", "Anna"], ["zelda", "Zelda"]] as const) {
    ids[key] = (
      await prisma.person.create({ data: { icgId: `${RUN}-${key}`.toUpperCase(), aliases: { create: { name: `${RUN} ${alias}`, isCommon: true } } } })
    ).id;
  }
  await session("self", { date: "2004-08-10", people: ["anna"], set: { title: "Garden", release: "2004-08-10" } });
  await session("twin", { date: "2004-08-20", people: ["anna"], set: { title: "Summer Beach", release: "2004-08-20" } });
  await session("labelOnly", { set: { title: "Studio", release: "2010-01-01" } });
  await session("stranger", { people: ["zelda"] });
  await session("refSession", { type: "REFERENCE", people: ["anna"] });
});

afterAll(async () => {
  const sessions = ["self", "twin", "labelOnly", "stranger", "refSession"].map((k) => ids[k]).filter(Boolean);
  await prisma.setSession.deleteMany({ where: { sessionId: { in: sessions } } });
  await prisma.sessionContribution.deleteMany({ where: { sessionId: { in: sessions } } });
  // The merge rebuilt the participant cache of the merged sets
  await prisma.setParticipant.deleteMany({ where: { set: { title: { startsWith: RUN } } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { OR: [{ id: { in: sessions } }, { description: RUN }] } });
  await prisma.channel.deleteMany({ where: { id: ids.channel } });
  await prisma.label.deleteMany({ where: { id: ids.label } });
  const persons = [ids.anna, ids.zelda].filter(Boolean);
  await prisma.personAlias.deleteMany({ where: { personId: { in: persons } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
});

describe("getSessionMergeCandidates", () => {
  it("suggests by shared people, label and closeness — best first, with the reasons", async () => {
    const { self, candidates } = await getSessionMergeCandidates(ids.self);
    expect(self?.sets.map((s) => s.title)).toEqual([`${RUN} Garden`]);
    const mine = candidates.filter((c) => [ids.twin, ids.labelOnly, ids.stranger, ids.refSession].includes(c.id));
    expect(mine.map((c) => c.id)).toEqual([ids.twin, ids.labelOnly]);

    const twin = mine[0]!;
    expect(twin.reasons).toEqual([
      { kind: "people", names: [`${RUN} Anna (${`${RUN}-anna`.toUpperCase()})`] },
      { kind: "label", name: `${RUN} Label` },
      { kind: "close", days: 10 },
    ]);
    expect(twin.score).toBeGreaterThan(mine[1]!.score);
    expect(twin.sets[0]).toMatchObject({ title: `${RUN} Summer Beach`, channelName: `${RUN} Channel` });
    expect(twin.labelName).toBe(`${RUN} Label`);
  });

  it("searches set titles, people and labels — never reference sessions", async () => {
    const bySet = await getSessionMergeCandidates(ids.self, `${RUN} Summer`);
    expect(bySet.candidates.map((c) => c.id)).toEqual([ids.twin]);

    const byPerson = await getSessionMergeCandidates(ids.self, `${RUN} Zelda`);
    expect(byPerson.candidates.map((c) => c.id)).toEqual([ids.stranger]);
    const byIcg = await getSessionMergeCandidates(ids.self, `${RUN}-zelda`);
    expect(byIcg.candidates.map((c) => c.id)).toEqual([ids.stranger]);

    const byLabel = await getSessionMergeCandidates(ids.self, `${RUN} Label`);
    expect(byLabel.candidates.map((c) => c.id)).toEqual([ids.twin, ids.labelOnly]);

    const byAnna = await getSessionMergeCandidates(ids.self, `${RUN} Anna`);
    expect(byAnna.candidates.map((c) => c.id)).not.toContain(ids.refSession);
  });
});

describe("merging — the older session stays", () => {
  it("started from the newer session, the older one survives and gets its set", async () => {
    const direction = await getSessionMergeDirection(ids.twin, ids.self);
    expect(direction).toEqual({ survivorId: ids.self, absorbedId: ids.twin, reason: "date" });

    await mergeSessionsRecord(direction.survivorId, direction.absorbedId);
    expect(await prisma.session.findUnique({ where: { id: ids.twin } })).toBeNull();
    const links = await prisma.setSession.findMany({ where: { sessionId: ids.self }, select: { setId: true } });
    expect(links.map((l) => l.setId).sort()).toEqual([ids["set:self"], ids["set:twin"]].sort());
  });
});
