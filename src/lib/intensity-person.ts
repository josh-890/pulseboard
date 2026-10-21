import { actValue, effectiveExtras, sessionIntensity, type ActExtraOverride, type IntensityExtraRef } from "@/lib/intensity";

// A person's intensity across their sessions (ADR-0036, slice 3). Pure: built
// from their on-camera contributions and the catalog. Sessions run oldest
// first; undated ones (no date, or precision UNKNOWN) come last and never
// count as a first time.

export type PersonIntensityInput = {
  sessionId: string;
  sessionName: string;
  date: Date | null;
  precision: string;
  extraIds: string[];
  acts: { actId: string; overrides: ActExtraOverride[] }[];
};

export type IntensityCatalogRefs = {
  acts: Map<string, { level: number; scenarioId: string }>;
  extras: Map<string, IntensityExtraRef>;
};

export type DatedRef = { sessionId: string; date: Date | null; precision: string };

export type PersonIntensitySession = DatedRef & {
  sessionName: string;
  /** The person's intensity in the session, or null without acts (and without Max) */
  value: number | null;
  acts: { actId: string; value: number }[];
  /** Acts reached here for the first time (dated sessions only) */
  firsts: string[];
  dated: boolean;
};

export type PersonIntensity = {
  sessions: PersonIntensitySession[];
  peak: { value: number; sessionId: string } | null;
  scenarioPeaks: Record<string, { value: number; sessionId: string }>;
  /** Mean of the session values that exist */
  mean: number | null;
  reached: Record<string, { count: number; best: number; first: DatedRef | null }>;
};

const isDated = (r: { date: Date | null; precision: string }) => r.date !== null && r.precision !== "UNKNOWN";

export function summarizePersonIntensity(input: PersonIntensityInput[], catalog: IntensityCatalogRefs): PersonIntensity {
  // One entry per session — a person with two on-camera roles there counts once, at their best
  const bySession = new Map<string, PersonIntensitySession>();
  for (const c of input) {
    const inherited = c.extraIds.map((id) => catalog.extras.get(id)).filter((e) => e !== undefined);
    const acts = c.acts
      .filter((a) => catalog.acts.has(a.actId))
      .map((a) => ({
        actId: a.actId,
        value: actValue(catalog.acts.get(a.actId)!.level, effectiveExtras(inherited, a.overrides, catalog.extras)),
      }));
    const value = sessionIntensity(
      acts.map((a) => a.value),
      inherited,
    );
    const prev = bySession.get(c.sessionId);
    if (!prev) {
      bySession.set(c.sessionId, {
        sessionId: c.sessionId,
        sessionName: c.sessionName,
        date: c.date,
        precision: c.precision,
        dated: isDated(c),
        value,
        acts,
        firsts: [],
      });
      continue;
    }
    const best = new Map(prev.acts.map((a) => [a.actId, a.value]));
    for (const a of acts) best.set(a.actId, Math.max(best.get(a.actId) ?? 0, a.value));
    prev.acts = [...best].map(([actId, v]) => ({ actId, value: v }));
    prev.value = prev.value === null ? value : value === null ? prev.value : Math.max(prev.value, value);
  }

  const sessions = [...bySession.values()].sort((a, b) => {
    if (a.dated !== b.dated) return a.dated ? -1 : 1;
    if (!a.dated) return a.sessionName.localeCompare(b.sessionName);
    return a.date!.getTime() - b.date!.getTime();
  });

  const reached: PersonIntensity["reached"] = {};
  const scenarioPeaks: PersonIntensity["scenarioPeaks"] = {};
  let peak: PersonIntensity["peak"] = null;
  for (const s of sessions) {
    if (s.value !== null && (peak === null || s.value > peak.value)) peak = { value: s.value, sessionId: s.sessionId };
    for (const a of s.acts) {
      const r = (reached[a.actId] ??= { count: 0, best: 0, first: null });
      r.count += 1;
      r.best = Math.max(r.best, a.value);
      if (!r.first && s.dated) {
        r.first = { sessionId: s.sessionId, date: s.date, precision: s.precision };
        s.firsts.push(a.actId);
      }
      const scenarioId = catalog.acts.get(a.actId)!.scenarioId;
      const sp = scenarioPeaks[scenarioId];
      if (!sp || a.value > sp.value) scenarioPeaks[scenarioId] = { value: a.value, sessionId: s.sessionId };
    }
  }

  const values = sessions.map((s) => s.value).filter((v): v is number => v !== null);
  const mean = values.length ? values.reduce((x, y) => x + y, 0) / values.length : null;
  return { sessions, peak, scenarioPeaks, mean, reached };
}
