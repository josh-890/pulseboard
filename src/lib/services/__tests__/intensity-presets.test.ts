import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  applyIntensityPreset,
  copyContributionIntensity,
  getSessionIntensity,
  setContributionAct,
  setContributionExtras,
  setIntensityReviewed,
  undoIntensityPreset,
} from "@/lib/services/intensity-service";
import {
  createIntensityPreset,
  deleteIntensityPreset,
  getIntensityPresets,
  moveIntensityActs,
  moveIntensityPreset,
  setIntensityGroupScenariosOff,
  setIntensityPresetActs,
  setIntensityPresetExtras,
} from "@/lib/services/intensity-catalog-service";

// Intensity presets (2026-10-24): a bundle of acts and session extras applied to
// a session's models — adds only, marks its ticks, puts them to review — with
// Undo; confirming per model; a copy, so editing or deleting it changes no session.
const RUN = `ipr${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function person(key: string) {
  ids[key] = (await prisma.person.create({ data: { icgId: `${RUN}-${key}`.toUpperCase(), sexAtBirth: "female" } })).id;
  await prisma.personAlias.create({ data: { personId: ids[key]!, name: `${RUN} ${key}`, isCommon: true } });
}

const reviewedAt = async (id: string) =>
  (await prisma.sessionContribution.findUniqueOrThrow({ where: { id }, select: { intensityReviewedAt: true } })).intensityReviewedAt;

beforeAll(async () => {
  await person("anna");
  await person("bea");
  await person("guest");
  ids.session = (await prisma.session.create({ data: { name: `${RUN} session` } })).id;
  const c = (who: string, role = "crd_model") =>
    prisma.sessionContribution.create({ data: { sessionId: ids.session!, personId: ids[who]!, roleDefinitionId: role } });
  ids.cAnna = (await c("anna")).id;
  ids.cBea = (await c("bea")).id;
  ids.cGuest = (await c("guest", "crd_appearance")).id;
  ids.scenario = (await prisma.intensityScenario.create({ data: { name: `${RUN} scenario`, sortOrder: 99 } })).id;
  ids.low = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "low", level: 2 } })).id;
  ids.mid = (await prisma.intensityAct.create({ data: { scenarioId: ids.scenario!, name: "mid", level: 4 } })).id;
  ids.group = (await prisma.intensityExtraGroup.create({ data: { name: `${RUN} where` } })).id;
  ids.semi = (await prisma.intensityExtra.create({ data: { name: `${RUN} semi`, points: 1, groupId: ids.group } })).id;
  ids.secluded = (await prisma.intensityExtra.create({ data: { name: `${RUN} secluded`, points: 0.5, groupId: ids.group } })).id;
  ids.first = (await prisma.intensityExtra.create({ data: { name: `${RUN} first`, points: 1 } })).id;
  ids.other = (await prisma.intensityScenario.create({ data: { name: `${RUN} other`, sortOrder: 100 } })).id;
  ids.elsewhere = (await prisma.intensityAct.create({ data: { scenarioId: ids.other!, name: "elsewhere", level: 1 } })).id;
  ids.preset = await createIntensityPreset(ids.scenario!, `${RUN} artistic`);
  await setIntensityPresetActs(ids.preset, [ids.low!, ids.mid!]);
  await setIntensityPresetExtras(ids.preset, [ids.secluded!]);
});

afterAll(async () => {
  const persons = [ids.anna, ids.bea, ids.guest].filter(Boolean) as string[];
  await prisma.sessionContribution.deleteMany({ where: { personId: { in: persons } } });
  await prisma.session.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.personAlias.deleteMany({ where: { personId: { in: persons } } });
  await prisma.person.deleteMany({ where: { id: { in: persons } } });
  await prisma.intensityPreset.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityExtra.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityExtraGroup.deleteMany({ where: { name: { startsWith: RUN } } });
  await prisma.intensityScenario.deleteMany({ where: { name: { startsWith: RUN } } });
});

describe("intensity presets", () => {
  it("refuses two extras of one group", async () => {
    await expect(setIntensityPresetExtras(ids.preset!, [ids.semi!, ids.secluded!])).rejects.toThrow(/one extra per group/);
  });

  it("is for one scenario: only its acts, only extras counting there (2026-10-25)", async () => {
    await expect(setIntensityPresetActs(ids.preset!, [ids.low!, ids.elsewhere!])).rejects.toThrow(/not an act of/);
    const p = await createIntensityPreset(ids.other!, `${RUN} partner`);
    await setIntensityPresetExtras(p, [ids.semi!]);
    // The location group stops counting in that scenario: the preset lets go of it
    await setIntensityGroupScenariosOff(ids.group!, [ids.other!]);
    expect((await getIntensityPresets()).find((x) => x.id === p)!.extraIds).toEqual([]);
    await expect(setIntensityPresetExtras(p, [ids.semi!])).rejects.toThrow(/does not count in/);
    await setIntensityGroupScenariosOff(ids.group!, []);
    // An act moved to another scenario leaves the presets of its old one
    await setIntensityPresetActs(p, [ids.elsewhere!]);
    await moveIntensityActs([ids.elsewhere!], { scenarioId: ids.scenario!, level: 1, beforeId: null });
    expect((await getIntensityPresets()).find((x) => x.id === p)!.actIds).toEqual([]);
  });

  it("adds only what is missing, marks its ticks, lays its extras over and puts the model to review", async () => {
    // Anna: low by hand, semi + first time, confirmed
    await setContributionAct(ids.cAnna!, ids.low!, true);
    await setContributionExtras(ids.cAnna!, [ids.semi!, ids.first!]);
    await setIntensityReviewed([ids.cAnna!], true);
    expect(await reviewedAt(ids.cAnna!)).not.toBeNull();

    const undo = await applyIntensityPreset([ids.cAnna!, ids.cBea!], ids.preset!);
    expect(undo.people.find((p) => p.contributionId === ids.cAnna)!.actIds).toEqual([ids.mid]);

    const rows = await getSessionIntensity(ids.session!);
    const anna = rows.find((r) => r.id === ids.cAnna)!;
    const bea = rows.find((r) => r.id === ids.cBea)!;
    // The hand tick stays a hand tick
    expect(anna.acts.map((a) => [a.actId, a.presetId]).sort()).toEqual([[ids.low, null], [ids.mid, ids.preset]].sort());
    // Secluded replaces semi in its group, first time stays
    expect(anna.extraIds.sort()).toEqual([ids.secluded, ids.first].sort());
    expect(anna.reviewed).toBe(false);
    expect(bea.acts.map((a) => a.presetId)).toEqual([ids.preset, ids.preset]);
    expect(bea.extraIds).toEqual([ids.secluded]);
  });

  it("Undo takes its ticks back and returns extras and review state", async () => {
    await setContributionAct(ids.cBea!, ids.low!, false);
    await setContributionAct(ids.cBea!, ids.mid!, false);
    await setContributionExtras(ids.cBea!, []);
    await setIntensityReviewed([ids.cBea!], true);
    const undo = await applyIntensityPreset([ids.cBea!], ids.preset!);
    await undoIntensityPreset(undo);
    const bea = (await getSessionIntensity(ids.session!)).find((r) => r.id === ids.cBea)!;
    expect(bea.acts).toEqual([]);
    expect(bea.extraIds).toEqual([]);
    expect(bea.reviewed).toBe(true);
  });

  it("is for the models only — someone only appearing is refused", async () => {
    await expect(applyIntensityPreset([ids.cGuest!], ids.preset!)).rejects.toThrow(/for the models/);
    await setIntensityReviewed([ids.cGuest!], true);
    expect(await reviewedAt(ids.cGuest!)).toBeNull();
  });

  it("Same as… puts the copied-to model to review", async () => {
    await setIntensityReviewed([ids.cBea!], true);
    await copyContributionIntensity(ids.cAnna!, ids.cBea!);
    expect(await reviewedAt(ids.cBea!)).toBeNull();
  });

  it("is a copy: deleting it keeps the ticks, which forget the preset", async () => {
    const other = await createIntensityPreset(ids.scenario!, `${RUN} second`);
    await moveIntensityPreset(other, -1);
    const order = (await getIntensityPresets()).filter((p) => p.scenarioId === ids.scenario).map((p) => p.id);
    expect(order).toEqual([other, ids.preset]);
    await deleteIntensityPreset(ids.preset!);
    const anna = (await getSessionIntensity(ids.session!)).find((r) => r.id === ids.cAnna)!;
    expect(anna.acts.map((a) => a.presetId)).toEqual([null, null]);
  });
});
