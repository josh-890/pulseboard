/**
 * The set gallery's "people shown" filter (ADR-0023).
 *
 * Each cast member is a three-state chip: must be shown, must not be shown, or
 * irrelevant. Chips combine with AND, the way Apple Photos' smart-album rules
 * ("person includes / does not include") and Lightroom's "contains all / doesn't
 * contain" do. "A alone" is therefore A included and everybody else excluded —
 * the combination row sets exactly that in one click, and only lists the
 * combinations the images actually contain.
 *
 * An image's shown set is its session cast minus its exclusions, restricted to
 * the set's cast (a compilation's session cast may name people this set does not
 * credit, and a chip cannot be offered for them).
 */

export type PeopleChipState = "include" | "exclude";
export type PeopleFilter = Readonly<Record<string, PeopleChipState>>;

type ShownSource = { sessionCastIds?: string[]; hiddenPersonIds?: string[] };

export const EMPTY_PEOPLE_FILTER: PeopleFilter = {};

/** Who the image shows, in cast order. */
export function shownPeople(item: ShownSource, castIds: readonly string[]): string[] {
  const inSession = new Set(item.sessionCastIds ?? []);
  const hidden = new Set(item.hiddenPersonIds ?? []);
  return castIds.filter((id) => inSession.has(id) && !hidden.has(id));
}

export function isPeopleFilterActive(filter: PeopleFilter): boolean {
  return Object.keys(filter).length > 0;
}

export function matchesPeopleFilter(shown: readonly string[], filter: PeopleFilter): boolean {
  const set = new Set(shown);
  for (const [id, state] of Object.entries(filter)) {
    if (state === "include" && !set.has(id)) return false;
    if (state === "exclude" && set.has(id)) return false;
  }
  return true;
}

/** off → must show → must not show → off. */
export function cycleChip(filter: PeopleFilter, personId: string): PeopleFilter {
  const next: Record<string, PeopleChipState> = { ...filter };
  const current = filter[personId];
  if (current === undefined) next[personId] = "include";
  else if (current === "include") next[personId] = "exclude";
  else delete next[personId];
  return next;
}

export type PeopleCombination = {
  /** Stable key: the person ids joined, "" for nobody. */
  key: string;
  personIds: string[];
  count: number;
};

/**
 * Every shown-set that occurs among the images, with its count. Ordered solo
 * first, then pairs and larger groups, "nobody" last; within a size, by cast
 * order — so a two-person set reads `A alone · B alone · A + B · nobody`.
 */
export function peopleCombinations(
  items: readonly ShownSource[],
  castIds: readonly string[],
): PeopleCombination[] {
  const byKey = new Map<string, PeopleCombination>();
  for (const item of items) {
    const personIds = shownPeople(item, castIds);
    const key = personIds.join("|");
    const hit = byKey.get(key);
    if (hit) hit.count++;
    else byKey.set(key, { key, personIds, count: 1 });
  }
  const rank = new Map(castIds.map((id, i) => [id, i]));
  const size = (c: PeopleCombination) => (c.personIds.length === 0 ? Infinity : c.personIds.length);
  return [...byKey.values()].sort((a, b) => {
    if (size(a) !== size(b)) return size(a) - size(b);
    for (let i = 0; i < a.personIds.length; i++) {
      const d = (rank.get(a.personIds[i]) ?? 0) - (rank.get(b.personIds[i]) ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
}

/** The filter that shows exactly this combination: its people in, the rest out. */
export function filterForCombination(
  personIds: readonly string[],
  castIds: readonly string[],
): PeopleFilter {
  const inCombo = new Set(personIds);
  return Object.fromEntries(castIds.map((id) => [id, inCombo.has(id) ? "include" : "exclude"]));
}

export function isCombinationFilter(
  filter: PeopleFilter,
  personIds: readonly string[],
  castIds: readonly string[],
): boolean {
  const want = filterForCombination(personIds, castIds);
  const keys = Object.keys(filter);
  return keys.length === castIds.length && keys.every((id) => filter[id] === want[id]);
}
