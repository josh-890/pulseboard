// Intensity (ADR-0036): how an act's value is reached. Pure — no database.
//
// A person's session extras are inherited by each of their acts there; an act
// may ADD an extra (a grouped one replaces the inherited choice in its group)
// or DROP an inherited one. The value is the act's level plus the points of its
// extras, never above the cap — unless Max is among them, which sets Max.
//
// Max is the top of the scale, set per tenant (a whole number, 10 unless
// changed, 2026-10-23); the cap is half a step below it. Values are computed
// on read, so a new Max re-rates everything at once — no act's level changes.

export const INTENSITY_STEP = 0.5;
/** The top of the scale until a tenant sets its own */
export const DEFAULT_INTENSITY_MAX = 10;
/** Max as a whole number within these bounds */
export const INTENSITY_MAX_RANGE = { min: 3, max: 20 } as const;

/** Where level + extras stop: half a step below Max */
export function intensityCap(max: number): number {
  return max - INTENSITY_STEP;
}

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

/** An act's value: the Max extra → Max, otherwise level + points, capped half a step below Max */
export function actValue(level: number, extras: IntensityExtraRef[], max: number): number {
  if (extras.some((e) => e.isMax)) return max;
  const sum = level + extras.reduce((acc, e) => acc + e.points, 0);
  return Math.min(intensityCap(max), sum);
}

/**
 * A session's intensity for a person: their highest act, or null without acts.
 * Max among their session extras makes the whole session Max — acts or not.
 */
export function sessionIntensity(actValues: number[], sessionExtras: IntensityExtraRef[], max: number): number | null {
  if (sessionExtras.some((e) => e.isMax)) return max;
  return actValues.length ? Math.max(...actValues) : null;
}

/** "7", "6.5", "10" */
export function formatIntensity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The rows of the catalog, lowest first: every whole value below Max, then the
 * cap and Max; a half step when it is described or an act sits on it, or all
 * half steps when asked.
 */
export function intensityRows(described: number[], actLevels: number[], showHalfSteps: boolean, max: number): number[] {
  const cap = intensityCap(max);
  const rows = new Set<number>([cap, max, ...described.filter((v) => v <= max), ...actLevels]);
  for (let v = 0; v <= cap; v += INTENSITY_STEP) {
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
export function explainActValue(
  actName: string,
  level: number,
  extras: (IntensityExtraRef & { name: string })[],
  max: number,
): string {
  const maxExtra = extras.find((e) => e.isMax);
  if (maxExtra) return `${maxExtra.name} → ${formatIntensity(max)}`;
  const cap = intensityCap(max);
  const added = extras.filter((e) => e.points > 0);
  const sum = level + added.reduce((acc, e) => acc + e.points, 0);
  const parts = [`${actName} ${formatIntensity(level)}`, ...added.map((e) => `${e.name} ${formatIntensity(e.points)}`)];
  const shown = parts.length === 1 ? `${parts[0]}` : `${parts.join(" + ")} = ${formatIntensity(sum)}`;
  return sum > cap ? `${shown} → capped at ${formatIntensity(cap)}` : shown;
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

/**
 * The browsers' Intensity filter (slice 4): at least this value — 0 = anything
 * recorded; four thresholds spread below Max, then Max itself.
 */
export function intensityFilterOptions(max: number): { value: string; label: string }[] {
  const steps = [0.3, 0.5, 0.7, 0.9].map((f) => Math.round(max * f)).filter((v, i, a) => v > 0 && v < max && a.indexOf(v) === i);
  return [
    { value: "0", label: "Anything recorded" },
    ...steps.map((v) => ({ value: String(v), label: `≥ ${v}` })),
    { value: String(max), label: `${max} · Max` },
  ];
}

/** The `intensity=` URL parameter added to the `tags=` query text — one query answers both */
export function withIntensityFilter(tags: string | undefined, intensity: string | undefined, max: number): string | undefined {
  if (!intensity || !intensityFilterOptions(max).some((o) => o.value === intensity)) return tags;
  return [tags?.trim(), `intensity>=${intensity}`].filter(Boolean).join(" ");
}

/**
 * The heat of a value: green → yellow → orange → red → violet from 0 to Max,
 * continuous, so half steps sit between their neighbours (the PGRADE ramp).
 */
const HEAT: [number, number, number][] = [
  [162, 214, 176],
  [177, 214, 160],
  [196, 214, 140],
  [213, 200, 125],
  [230, 176, 110],
  [224, 155, 110],
  [219, 133, 110],
  [214, 110, 110],
  [171, 103, 143],
  [128, 96, 176],
];

function heat(value: number, max: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(t));
  const f = t - i;
  const [a, b] = [HEAT[i]!, HEAT[i + 1]!];
  const mix = (k: number) => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return [mix(0), mix(1), mix(2)];
}

export function intensityColor(value: number, max: number): string {
  const [r, g, b] = heat(value, max);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Dark text on the light end of the ramp, white on the dark end — whichever reads better */
export function intensityTextColor(value: number, max: number): string {
  const [r, g, b] = heat(value, max).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.3 ? "rgb(17, 24, 39)" : "rgb(255, 255, 255)";
}
