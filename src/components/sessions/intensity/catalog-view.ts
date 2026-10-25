import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import type { SessionIntensityCatalog } from "./types";

/**
 * The catalog as the intensity panel needs it — on a session or on a set — or
 * null while it has no acts (then neither shows intensity)
 */
export function sessionIntensityCatalog(full: IntensityCatalog | null): SessionIntensityCatalog | null {
  if (!full || !full.scenarios.some((s) => s.acts.length > 0)) return null;
  return {
    scenarios: full.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      acts: s.acts.map((a) => ({ id: a.id, name: a.name, description: a.description, level: a.level })),
    })),
    max: full.max,
    presets: full.presets.map((p) => ({ id: p.id, scenarioId: p.scenarioId, name: p.name, description: p.description, actIds: p.actIds, extraIds: p.extraIds })),
    groups: full.groups.map((g) => ({ id: g.id, name: g.name })),
    extras: full.extras.map((e) => ({
      id: e.id,
      name: e.name,
      points: e.points,
      groupId: e.groupId,
      isMax: e.isMax,
      offIn: e.offIn,
    })),
  };
}
