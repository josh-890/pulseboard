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

/** A session's intensity for a person: their highest act, or null without acts */
export function sessionIntensity(actValues: number[]): number | null {
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
