// Intensity (ADR-0036): how an act's value is reached. Pure — no database.
//
// A person's session extras are inherited by each of their acts there; an act
// may ADD an extra (a grouped one replaces the inherited choice in its group)
// or DROP an inherited one. The value is the act's level plus the points of its
// extras, never above CAP — unless Max is among them, which sets MAX.

export const INTENSITY_CAP = 9.5;
export const INTENSITY_MAX = 10;
export const INTENSITY_STEP = 0.5;

export type IntensityExtraRef = {
  id: string;
  points: number;
  groupId: string | null;
  isMax: boolean;
};

export type ActExtraOverride = {
  extraId: string;
  mode: "ADD" | "DROP";
};

/** True for a value in 0.5 steps, 0 or more */
export function isIntensityStep(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value / INTENSITY_STEP);
}

/** The extras an act carries: the inherited ones with its own departures applied */
export function effectiveExtras<E extends IntensityExtraRef>(
  inherited: E[],
  overrides: ActExtraOverride[],
  byId: Map<string, E>,
): E[] {
  const result = new Map(inherited.map((e) => [e.id, e]));
  for (const o of overrides) {
    if (o.mode === "DROP") {
      result.delete(o.extraId);
      continue;
    }
    const extra = byId.get(o.extraId);
    if (!extra) continue;
    if (extra.groupId) {
      for (const e of [...result.values()]) if (e.groupId === extra.groupId) result.delete(e.id);
    }
    result.set(extra.id, extra);
  }
  return [...result.values()];
}

/** An act's value: Max → 10, otherwise level + points, capped at 9.5 */
export function actValue(level: number, extras: IntensityExtraRef[]): number {
  if (extras.some((e) => e.isMax)) return INTENSITY_MAX;
  const sum = level + extras.reduce((acc, e) => acc + e.points, 0);
  return Math.min(INTENSITY_CAP, sum);
}

/**
 * A session's intensity for a person: their highest act, or null without acts.
 * Max among their session extras makes the whole session 10 — acts or not.
 */
export function sessionIntensity(actValues: number[], sessionExtras: IntensityExtraRef[] = []): number | null {
  if (sessionExtras.some((e) => e.isMax)) return INTENSITY_MAX;
  return actValues.length ? Math.max(...actValues) : null;
}

/** "7", "6.5", "10" */
export function formatIntensity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The rows of the catalog, lowest first: every whole value up to 9, then 9.5
 * and Max (10); a half step when it is described or an act sits on it, or
 * all half steps when asked.
 */
export function intensityRows(described: number[], actLevels: number[], showHalfSteps: boolean): number[] {
  const rows = new Set<number>([INTENSITY_CAP, INTENSITY_MAX, ...described, ...actLevels]);
  for (let v = 0; v <= INTENSITY_CAP; v += INTENSITY_STEP) {
    if (showHalfSteps || Number.isInteger(v)) rows.add(v);
  }
  return [...rows].sort((a, b) => a - b);
}

/** The seeded scenarios the cast suggests (ADR-0036) — by id, so renaming keeps the rule */
export const SCENARIO_IDS = {
  solo: "dsit-solo",
  gg: "dsit-gg",
  gb: "dsit-gb",
  group: "dsit-group",
} as const;

/**
 * Which scenarios a person's cast suggests: alone → Solo; with one
 * other → G-G (two women) or G-B (a woman and a man); with two or more others →
 * Group. Unknown sexes suggest nothing — every scenario stays one click away.
 */
export function suggestScenarioIds(self: string | null, others: (string | null)[]): string[] {
  if (others.length === 0) return [SCENARIO_IDS.solo];
  if (others.length >= 2) return [SCENARIO_IDS.group];
  const pair = [self, others[0]];
  if (pair.some((s) => s !== "female" && s !== "male")) return [];
  if (pair.every((s) => s === "female")) return [SCENARIO_IDS.gg];
  if (pair.includes("female") && pair.includes("male")) return [SCENARIO_IDS.gb];
  return [];
}

/** An act's departures from the inherited extras, so that it carries exactly `wanted` */
export function overridesFor(inherited: string[], wanted: string[]): ActExtraOverride[] {
  const has = new Set(inherited);
  const want = new Set(wanted);
  return [
    ...[...want].filter((id) => !has.has(id)).map((extraId) => ({ extraId, mode: "ADD" as const })),
    ...[...has].filter((id) => !want.has(id)).map((extraId) => ({ extraId, mode: "DROP" as const })),
  ];
}

/**
 * How an act's value comes about, for a tooltip: "Topless 5 + Semi-public 1 = 6",
 * "… = 10.5 → capped at 9.5", or "Max → 10".
 */
export function explainActValue(actName: string, level: number, extras: (IntensityExtraRef & { name: string })[]): string {
  const max = extras.find((e) => e.isMax);
  if (max) return `${max.name} → ${INTENSITY_MAX}`;
  const added = extras.filter((e) => e.points > 0);
  const sum = level + added.reduce((acc, e) => acc + e.points, 0);
  const parts = [`${actName} ${formatIntensity(level)}`, ...added.map((e) => `${e.name} ${formatIntensity(e.points)}`)];
  const shown = parts.length === 1 ? `${parts[0]}` : `${parts.join(" + ")} = ${formatIntensity(sum)}`;
  return sum > INTENSITY_CAP ? `${shown} → capped at ${formatIntensity(INTENSITY_CAP)}` : shown;
}

/**
 * Applies one change made to several people at once to one person's extras.
 * `common` is what all of them had, `next` what the controls now show: what
 * left `common` goes, what joined it comes — and a grouped extra that comes
 * replaces the person's other choice in its group.
 */
export function applySharedExtras(
  personExtras: string[],
  common: string[],
  next: string[],
  groupOf: (extraId: string) => string | null,
): string[] {
  const removed = new Set(common.filter((id) => !next.includes(id)));
  const added = next.filter((id) => !common.includes(id));
  const addedGroups = new Set(added.map(groupOf).filter((g): g is string => g !== null));
  const kept = personExtras.filter((id) => !removed.has(id) && !(groupOf(id) !== null && addedGroups.has(groupOf(id)!)));
  return [...new Set([...kept, ...added])];
}

/** The browsers' Intensity filter (slice 4): at least this value — 0 = anything recorded */
export const INTENSITY_FILTER_OPTIONS = [
  { value: "0", label: "Anything recorded" },
  { value: "3", label: "≥ 3" },
  { value: "5", label: "≥ 5" },
  { value: "7", label: "≥ 7" },
  { value: "9", label: "≥ 9" },
  { value: "10", label: "10 · Max" },
];

/** The `intensity=` URL parameter added to the `tags=` query text — one query answers both */
export function withIntensityFilter(tags: string | undefined, intensity: string | undefined): string | undefined {
  if (!intensity || !INTENSITY_FILTER_OPTIONS.some((o) => o.value === intensity)) return tags;
  return [tags?.trim(), `intensity>=${intensity}`].filter(Boolean).join(" ");
}
