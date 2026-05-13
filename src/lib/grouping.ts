export type Group<T> = {
  key: string;
  label: string;
  items: T[];
  subGroups?: Group<T>[];
};

/** Group a flat array into labeled buckets by a key function. */
export function computeGroups<T>(
  items: T[],
  getKey: (item: T) => string,
): Group<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([key, groupItems]) => ({
    key,
    label: key,
    items: groupItems,
  }));
}

/** Build two-level nested groups (outer → inner). */
export function buildNestedGroups<T>(
  items: T[],
  getOuterKey: (item: T) => string,
  getInnerKey: (item: T) => string,
): Group<T>[] {
  const outerMap = new Map<string, T[]>();
  for (const item of items) {
    const key = getOuterKey(item);
    const bucket = outerMap.get(key) ?? [];
    bucket.push(item);
    outerMap.set(key, bucket);
  }

  return Array.from(outerMap.entries()).map(([outerKey, outerItems]) => {
    const innerMap = new Map<string, T[]>();
    for (const item of outerItems) {
      const key = getInnerKey(item);
      const bucket = innerMap.get(key) ?? [];
      bucket.push(item);
      innerMap.set(key, bucket);
    }

    const subGroups: Group<T>[] = Array.from(innerMap.entries()).map(
      ([innerKey, innerItems]) => ({
        key: `${outerKey}::${innerKey}`,
        label: innerKey,
        items: innerItems,
      }),
    );

    return { key: outerKey, label: outerKey, items: outerItems, subGroups };
  });
}

const UNKNOWN_PREFIXES = ["Unknown", "Undated", "No Channel", "No Label", "#"];

function isUnknownKey(k: string) {
  return UNKNOWN_PREFIXES.some((u) => k === u || k.startsWith(u));
}

type SortMode = "alpha" | "year" | "decade" | "age_bracket" | "age_career";

const AGE_BRACKET_ORDER = ["Under 25", "25–30", "30–35", "35–40", "40+", "Unknown"];
const AGE_CAREER_ORDER = ["Under 18", "18–20", "20–25", "25–30", "30+", "Unknown"];

/** Sort group keys for display. Unknowns always sort last. */
export function sortGroupKeys(keys: string[], mode: SortMode): string[] {
  return [...keys].sort((a, b) => {
    const aUnknown = isUnknownKey(a);
    const bUnknown = isUnknownKey(b);
    if (aUnknown && bUnknown) return 0;
    if (aUnknown) return 1;
    if (bUnknown) return -1;

    switch (mode) {
      case "year":
      case "decade":
        return parseInt(b) - parseInt(a); // newest first
      case "age_bracket": {
        const ai = AGE_BRACKET_ORDER.indexOf(a);
        const bi = AGE_BRACKET_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      case "age_career": {
        const ai = AGE_CAREER_ORDER.indexOf(a);
        const bi = AGE_CAREER_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      default:
        return a.localeCompare(b);
    }
  });
}
