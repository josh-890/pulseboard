import { prisma } from "@/lib/db";
import { suggestScenarioIds } from "@/lib/intensity";
import { LEAD_ROLE } from "@/lib/services/session-contributors";
import { applyIntensityPreset, undoIntensityPreset, type PresetUndo } from "@/lib/services/intensity-service";

// A preset applied in bulk from /sessions and /sets (2026-10-27, slice 4): to
// the models of the selected sessions — from sets, their sessions — who are not
// confirmed yet and whose cast fits the preset's scenario (a Solo preset never
// lands on a couple). Each lands to review, as in the panel; Undo takes it back.

export type BulkEntity = "SESSION" | "SET";

/** Models per transaction — a big selection is applied in pieces */
const CHUNK = 50;

export type BulkPresetPlan = {
  preset: { id: string; name: string; scenario: string };
  /** The models it applies to */
  contributionIds: string[];
  /** Sessions with at least one of them */
  sessions: number;
  /** Models left alone: already confirmed */
  confirmed: number;
  /** Models left alone: their cast suggests another scenario */
  otherCast: number;
};

/** The presets to choose from, per scenario in catalog order */
export async function getBulkPresetChoices() {
  const scenarios = await prisma.intensityScenario.findMany({
    where: { presets: { some: {} } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      presets: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, description: true, _count: { select: { acts: true } } } },
    },
  });
  return scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    presets: s.presets.map((p) => ({ id: p.id, name: p.name, description: p.description, acts: p._count.acts })),
  }));
}

export type BulkPresetChoices = Awaited<ReturnType<typeof getBulkPresetChoices>>;

async function sessionIdsOf(entity: BulkEntity, ids: string[]): Promise<string[]> {
  if (entity === "SESSION") return [...new Set(ids)];
  const links = await prisma.setSession.findMany({ where: { setId: { in: ids } }, distinct: ["sessionId"], select: { sessionId: true } });
  return links.map((l) => l.sessionId);
}

/** Whom the preset would reach — nothing is written */
export async function planBulkIntensityPreset(entity: BulkEntity, ids: string[], presetId: string): Promise<BulkPresetPlan> {
  const [preset, sessionIds] = await Promise.all([
    prisma.intensityPreset.findUniqueOrThrow({
      where: { id: presetId },
      select: { id: true, name: true, scenarioId: true, scenario: { select: { name: true } } },
    }),
    sessionIdsOf(entity, ids),
  ]);
  const leads = await prisma.sessionContribution.findMany({
    where: { sessionId: { in: sessionIds }, roleDefinition: LEAD_ROLE },
    orderBy: [{ sessionId: "asc" }, { createdAt: "asc" }],
    select: { id: true, sessionId: true, intensityReviewedAt: true, person: { select: { id: true, sexAtBirth: true } } },
  });
  const contributionIds: string[] = [];
  const sessions = new Set<string>();
  let confirmed = 0;
  let otherCast = 0;
  for (const c of leads) {
    if (c.intensityReviewedAt) {
      confirmed++;
      continue;
    }
    const others = leads.filter((o) => o.sessionId === c.sessionId && o.person.id !== c.person.id).map((o) => o.person.sexAtBirth);
    const suggested = suggestScenarioIds(c.person.sexAtBirth, others);
    if (suggested.length > 0 && !suggested.includes(preset.scenarioId)) {
      otherCast++;
      continue;
    }
    contributionIds.push(c.id);
    sessions.add(c.sessionId);
  }
  return {
    preset: { id: preset.id, name: preset.name, scenario: preset.scenario.name },
    contributionIds,
    sessions: sessions.size,
    confirmed,
    otherCast,
  };
}

/**
 * Applies the preset to the models the plan reaches, in pieces; refuses when
 * the reach changed since the preview (someone rated meanwhile)
 */
export async function applyBulkIntensityPreset(
  entity: BulkEntity,
  ids: string[],
  presetId: string,
  expected: number,
): Promise<{ plan: BulkPresetPlan; undo: PresetUndo }> {
  const plan = await planBulkIntensityPreset(entity, ids, presetId);
  if (plan.contributionIds.length !== expected) throw new Error("The selection changed since the preview — open it again.");
  const undo: PresetUndo = { presetId, people: [] };
  for (let i = 0; i < plan.contributionIds.length; i += CHUNK) {
    const part = await applyIntensityPreset(plan.contributionIds.slice(i, i + CHUNK), presetId);
    undo.people.push(...part.people);
  }
  return { plan, undo };
}

/** Takes a bulk preset back, in the same pieces */
export async function undoBulkIntensityPreset(undo: PresetUndo) {
  for (let i = 0; i < undo.people.length; i += CHUNK) {
    await undoIntensityPreset({ presetId: undo.presetId, people: undo.people.slice(i, i + CHUNK) });
  }
}
