import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getRatingQueue } from "@/lib/services/rating-queue-service";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import { parseRateParam } from "@/lib/rating-queue";

// The Rated filter and the rating queue (2026-10-25): where the models'
// intensity stands per session and set (leads only), and a list walked by
// channel, then date — the sessions with models still to rate.
const RUN = `rq${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  for (const who of ["anna", "bea", "guest"]) {
    ids[who] = (await prisma.person.create({ data: { icgId: `${RUN}-${who}`.toUpperCase(), sexAtBirth: "female" } })).id;
  }
  ids.chA = (await prisma.channel.create({ data: { name: `${RUN} Alpha` } })).id;
  ids.chB = (await prisma.channel.create({ data: { name: `${RUN} beta` } })).id;
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} scenario`, sortOrder: 99 } })).id;
  ids.act = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "act", level: 2 } })).id;

  // name, channel, date, the leads (who, state) and someone only appearing
  const sessions: [string, string, string, [string, "unrated" | "review" | "done"][], boolean][] = [
    ["s1", "chB", "2020-01-01", [["anna", "unrated"]], false],
    ["s2", "chA", "2021-01-01", [["bea", "review"]], false],
    ["s3", "chA", "2019-01-01", [["anna", "done"]], false],
    ["s4", "chA", "2018-01-01", [], true],
    ["s5", "chA", "2022-01-01", [["anna", "done"], ["bea", "unrated"]], false],
  ];
  for (const [key, ch, date, leads, guest] of sessions) {
    ids[key] = (await prisma.session.create({ data: { name: `${RUN} ${key}`, date: new Date(date) } })).id;
    ids[`set-${key}`] = (await prisma.set.create({ data: { title: `${RUN} ${key}`, type: "photo", channelId: ids[ch]! } })).id;
    await prisma.setSession.create({ data: { setId: ids[`set-${key}`]!, sessionId: ids[key]!, isPrimary: true } });
    for (const [who, state] of leads) {
      const c = await prisma.sessionContribution.create({
        data: { sessionId: ids[key]!, personId: ids[who]!, roleDefinitionId: "crd_model", intensityReviewedAt: state === "done" ? new Date() : null },
      });
      if (state === "review") await prisma.contributionAct.create({ data: { contributionId: c.id, actId: ids.act! } });
    }
    if (guest) await prisma.sessionContribution.create({ data: { sessionId: ids[key]!, personId: ids.guest!, roleDefinitionId: "crd_appearance" } });
  }
  // A set holding two sessions: one to review, one confirmed
  ids.both = (await prisma.set.create({ data: { title: `${RUN} both`, type: "photo", channelId: ids.chA! } })).id;
  await prisma.setSession.createMany({ data: [{ setId: ids.both!, sessionId: ids.s2! }, { setId: ids.both!, sessionId: ids.s3! }] });
});

afterAll(async () => {
  const sessions = await prisma.session.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  await prisma.sessionContribution.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.setSession.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.setParticipant.deleteMany({ where: { set: { title: { startsWith: RUN } } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: RUN.toUpperCase() } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

async function matches(entity: "SESSION" | "SET", query: string): Promise<string[]> {
  const filter = await resolveTagFilterParam(query, entity);
  const ours = entity === "SESSION" ? ["s1", "s2", "s3", "s4", "s5"].map((k) => ids[k]!) : ["set-s1", "set-s2", "set-s3", "set-s4", "set-s5", "both"].map((k) => ids[k]!);
  const found = new Set(await findTagMatchIds(entity, filter!.resolved, ours));
  return Object.entries(ids)
    .filter(([, id]) => found.has(id))
    .map(([k]) => k)
    .sort();
}

describe("rated: — where the models' intensity stands", () => {
  it("reads unrated, review and done on sessions, models only", async () => {
    expect(await matches("SESSION", "rated:unrated")).toEqual(["s1"]);
    expect(await matches("SESSION", "rated:review")).toEqual(["s2", "s5"]);
    expect(await matches("SESSION", "rated:done")).toEqual(["s3"]);
  });

  it("takes a set's sessions together", async () => {
    expect(await matches("SET", "rated:review")).toEqual(["both", "set-s2", "set-s5"]);
    expect(await matches("SET", "rated:done")).toEqual(["set-s3"]);
  });
});

describe("the rating queue", () => {
  const rate = () => `sessions?q=${encodeURIComponent(RUN)}`;

  it("walks the list's sessions still to rate by channel, then date", async () => {
    const q = await getRatingQueue(rate(), ids.s2!);
    expect(q).toMatchObject({ position: 1, total: 3, prevId: null, nextId: ids.s5, channel: `${RUN} Alpha`, listHref: `/sessions?q=${RUN}` });
    const last = await getRatingQueue(rate(), ids.s1!);
    expect(last).toMatchObject({ position: 3, prevId: ids.s5, nextId: null, channel: `${RUN} beta` });
  });

  it("keeps the session on screen once it is confirmed, starts from the first otherwise", async () => {
    expect(await getRatingQueue(rate(), ids.s3!)).toMatchObject({ position: 1, total: 4, nextId: ids.s2 });
    expect(await getRatingQueue(rate(), "")).toMatchObject({ position: null, total: 3, nextId: ids.s2 });
  });

  it("walks a /sets list through its sets' sessions", async () => {
    const q = await getRatingQueue(`sets?q=${encodeURIComponent(`${RUN} both`)}`, "");
    expect(q).toMatchObject({ total: 1, nextId: ids.s2, listHref: `/sets?q=${RUN}+both` });
  });

  it("reads only sessions and sets lists, without paging", () => {
    expect(parseRateParam("people?q=x")).toBeNull();
    expect(parseRateParam(undefined)).toBeNull();
    expect(parseRateParam("sets?q=a&loaded=200&groupBy=year")).toEqual({ from: "sets", params: { q: "a" }, query: "q=a" });
  });
});
