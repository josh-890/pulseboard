import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyBulkIntensityPreset, planBulkIntensityPreset, undoBulkIntensityPreset } from "@/lib/services/intensity-bulk-service";

// A preset in bulk from /sessions and /sets (2026-10-27, slice 4): it reaches
// the models not confirmed yet whose cast fits its scenario — from sets, their
// sessions' — lands them to review with its ticks marked, and Undo takes it back.
const RUN = `ibk${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

const ticks = async (contributionId: string) =>
  (await prisma.contributionAct.findMany({ where: { contributionId }, select: { actId: true, presetId: true } }));

beforeAll(async () => {
  for (const who of ["anna", "bea", "cara", "dora", "eve", "guest"]) {
    ids[who] = (await prisma.person.create({ data: { icgId: `${RUN}-${who}`.toUpperCase(), sexAtBirth: "female" } })).id;
  }
  ids.act = (await prisma.intensityAct.create({ data: { scenarioId: "dsit-solo", name: `${RUN} act`, level: 2 } })).id;
  ids.preset = (await prisma.intensityPreset.create({ data: { scenarioId: "dsit-solo", name: `${RUN} solo preset` } })).id;
  await prisma.intensityPresetAct.create({ data: { presetId: ids.preset, actId: ids.act } });

  async function session(key: string, cast: [string, "lead" | "confirmed" | "appearing"][]) {
    ids[key] = (await prisma.session.create({ data: { name: `${RUN} ${key}` } })).id;
    for (const [who, how] of cast) {
      ids[`c-${key}-${who}`] = (
        await prisma.sessionContribution.create({
          data: {
            sessionId: ids[key]!,
            personId: ids[who]!,
            roleDefinitionId: how === "appearing" ? "crd_appearance" : "crd_model",
            intensityReviewedAt: how === "confirmed" ? new Date() : null,
          },
        })
      ).id;
    }
  }
  await session("alone", [["anna", "lead"]]);
  await session("pair", [["bea", "lead"], ["cara", "lead"]]);
  await session("done", [["dora", "confirmed"]]);
  await session("guested", [["eve", "lead"], ["guest", "appearing"]]);
  ids.set = (await prisma.set.create({ data: { title: `${RUN} set`, type: "photo" } })).id;
  await prisma.setSession.createMany({ data: [{ setId: ids.set!, sessionId: ids.alone! }, { setId: ids.set!, sessionId: ids.done! }] });
});

afterAll(async () => {
  const sessions = (await prisma.session.findMany({ where: { name: { startsWith: RUN } }, select: { id: true } })).map((s) => s.id);
  await prisma.sessionContribution.deleteMany({ where: { sessionId: { in: sessions } } });
  await prisma.setSession.deleteMany({ where: { sessionId: { in: sessions } } });
  await prisma.setParticipant.deleteMany({ where: { set: { title: { startsWith: RUN } } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
  await prisma.session.deleteMany({ where: { id: { in: sessions } } });
  await prisma.person.deleteMany({ where: { icgId: { startsWith: RUN.toUpperCase() } } });
  await prisma.intensityPreset.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityAct.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("a preset in bulk", () => {
  const all = () => [ids.alone!, ids.pair!, ids.done!, ids.guested!];

  it("reaches unconfirmed models whose cast fits — not confirmed ones, not another scenario's cast, not someone appearing", async () => {
    const plan = await planBulkIntensityPreset("SESSION", all(), ids.preset!);
    expect(plan.contributionIds.sort()).toEqual([ids["c-alone-anna"], ids["c-guested-eve"]].sort());
    expect(plan).toMatchObject({ sessions: 2, confirmed: 1, otherCast: 2, preset: { name: `${RUN} solo preset`, scenario: "Solo" } });
  });

  it("from sets, takes their sessions", async () => {
    const plan = await planBulkIntensityPreset("SET", [ids.set!], ids.preset!);
    expect(plan.contributionIds).toEqual([ids["c-alone-anna"]]);
    expect(plan.confirmed).toBe(1);
  });

  it("refuses when the reach changed since the preview; applies to review with marked ticks; Undo takes it back", async () => {
    await expect(applyBulkIntensityPreset("SESSION", all(), ids.preset!, 5)).rejects.toThrow(/changed since the preview/);
    const { undo } = await applyBulkIntensityPreset("SESSION", all(), ids.preset!, 2);
    for (const c of [ids["c-alone-anna"]!, ids["c-guested-eve"]!]) expect(await ticks(c)).toEqual([{ actId: ids.act, presetId: ids.preset }]);
    for (const c of [ids["c-pair-bea"]!, ids["c-done-dora"]!, ids["c-guested-guest"]!]) expect(await ticks(c)).toEqual([]);
    await undoBulkIntensityPreset(undo);
    for (const c of [ids["c-alone-anna"]!, ids["c-guested-eve"]!]) expect(await ticks(c)).toEqual([]);
  });
});
