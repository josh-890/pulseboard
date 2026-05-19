export type CategoricalFilter = {
  field: string;
  values: string[];
  mode: "exact" | "family";
};

export type RangeFilter = {
  field: string;
  min?: number;
  max?: number;
  tolerance?: number;
};

export type PresenceField =
  | "tattoo"
  | "scar"
  | "piercing"
  | "modification"
  | "procedure";

export type PresenceFilter = {
  field: PresenceField;
  state: "has" | "hasnt" | "any";
};

export type RegionFilter = {
  entity: PresenceField;
  regions: string[];
  mode: "any" | "all";
};

export type TextFilter = {
  field: string;
  query: string;
  fuzzy: boolean;
};

export type AttributeFilter = {
  definitionId: string;
  values: string[];         // for BOOLEAN / SINGLE_SELECT / MULTI_SELECT
  min?: number;             // for ORDINAL / NUMERIC
  max?: number;             // for ORDINAL / NUMERIC
};

export type TimeScope = "current" | "ever";

export type FilterSpec = {
  categorical: CategoricalFilter[];
  range: RangeFilter[];
  presence: PresenceFilter[];
  region: RegionFilter[];
  text: TextFilter[];
  attribute: AttributeFilter[];
  timeScope: TimeScope;
};

export const EMPTY_SPEC: FilterSpec = {
  categorical: [],
  range: [],
  presence: [],
  region: [],
  text: [],
  attribute: [],
  timeScope: "current",
};

export function isEmptySpec(spec: FilterSpec): boolean {
  return (
    spec.categorical.length === 0 &&
    spec.range.length === 0 &&
    spec.presence.length === 0 &&
    spec.region.length === 0 &&
    spec.text.length === 0 &&
    spec.attribute.length === 0
  );
}

export function specSummary(spec: FilterSpec): string {
  const parts: string[] = [];
  for (const c of spec.categorical) {
    if (c.values.length > 0)
      parts.push(`${c.field}=${c.values.join("|")}${c.mode === "family" ? "(fam)" : ""}`);
  }
  for (const r of spec.range) {
    const bits: string[] = [];
    if (r.min != null) bits.push(`>=${r.min}`);
    if (r.max != null) bits.push(`<=${r.max}`);
    if (bits.length > 0) parts.push(`${r.field}${bits.join(",")}`);
  }
  for (const p of spec.presence) {
    if (p.state !== "any") parts.push(`${p.field}=${p.state}`);
  }
  for (const reg of spec.region) {
    if (reg.regions.length > 0)
      parts.push(`${reg.entity}@${reg.regions.join("|")}${reg.mode === "all" ? "(all)" : ""}`);
  }
  for (const t of spec.text) {
    if (t.query) parts.push(`${t.field}~${t.query}`);
  }
  for (const a of spec.attribute) {
    if (a.values.length > 0) parts.push(`${a.definitionId}=${a.values.join("|")}`);
  }
  if (spec.timeScope === "ever") parts.push("ever");
  return parts.join(" ");
}

const PRESENCE_FIELDS: ReadonlySet<PresenceField> = new Set([
  "tattoo",
  "scar",
  "piercing",
  "modification",
  "procedure",
]);

function isPresenceField(v: string): v is PresenceField {
  return PRESENCE_FIELDS.has(v as PresenceField);
}

export function specToUrlParams(spec: FilterSpec): URLSearchParams {
  const p = new URLSearchParams();

  for (const c of spec.categorical) {
    if (c.values.length === 0) continue;
    p.set(`cat.${c.field}`, c.values.join(","));
    if (c.mode === "family") p.set(`cat.${c.field}.mode`, "family");
  }
  for (const r of spec.range) {
    if (r.min != null) p.set(`range.${r.field}.min`, String(r.min));
    if (r.max != null) p.set(`range.${r.field}.max`, String(r.max));
    if (r.tolerance != null) p.set(`range.${r.field}.tol`, String(r.tolerance));
  }
  for (const pr of spec.presence) {
    if (pr.state !== "any") p.set(`presence.${pr.field}`, pr.state);
  }
  for (const reg of spec.region) {
    if (reg.regions.length === 0) continue;
    p.set(`region.${reg.entity}`, reg.regions.join(","));
    if (reg.mode === "all") p.set(`region.${reg.entity}.mode`, "all");
  }
  for (const t of spec.text) {
    if (!t.query) continue;
    p.set(`text.${t.field}`, t.query);
    if (t.fuzzy) p.set(`text.${t.field}.fuzzy`, "1");
  }
  for (const a of spec.attribute) {
    const hasValues = a.values.length > 0;
    const hasRange = a.min != null || a.max != null;
    if (!hasValues && !hasRange) continue;
    if (hasValues) p.set(`attr.${a.definitionId}`, a.values.join(","));
    if (a.min != null) p.set(`attr.${a.definitionId}.min`, String(a.min));
    if (a.max != null) p.set(`attr.${a.definitionId}.max`, String(a.max));
  }
  if (spec.timeScope === "ever") p.set("time", "ever");

  return p;
}

type ReadableParams = {
  get: (key: string) => string | null;
  forEach?: (cb: (value: string, key: string) => void) => void;
  entries?: () => IterableIterator<[string, string]>;
};

function entriesOf(params: ReadableParams): [string, string][] {
  if (typeof params.entries === "function") {
    return Array.from(params.entries());
  }
  const out: [string, string][] = [];
  params.forEach?.((value, key) => out.push([key, value]));
  return out;
}

// Compat: hairShade/eyeShade were renamed to hairLightness/eyeLightness when
// the shade dimension switched from relative to absolute. Any saved search
// stored before the rename still references the old keys; remap on hydration.
const LEGACY_KEY_RENAMES: Record<string, string> = {
  "cat.hairShade": "cat.hairLightness",
  "cat.hairShade.mode": "cat.hairLightness.mode",
  "cat.eyeShade": "cat.eyeLightness",
  "cat.eyeShade.mode": "cat.eyeLightness.mode",
};

function renameLegacyKey(key: string): string {
  return LEGACY_KEY_RENAMES[key] ?? key;
}

export function specFromUrlParams(params: ReadableParams): FilterSpec {
  const spec: FilterSpec = {
    categorical: [],
    range: [],
    presence: [],
    region: [],
    text: [],
    attribute: [],
    timeScope: "current",
  };

  const catFields = new Map<string, CategoricalFilter>();
  const rangeFields = new Map<string, RangeFilter>();
  const regionFields = new Map<PresenceField, RegionFilter>();
  const textFields = new Map<string, TextFilter>();

  for (const [rawKey, value] of entriesOf(params)) {
    const key = renameLegacyKey(rawKey);
    if (key === "time") {
      if (value === "ever") spec.timeScope = "ever";
      continue;
    }

    if (key.startsWith("cat.")) {
      const rest = key.slice(4);
      if (rest.endsWith(".mode")) {
        const field = rest.slice(0, -5);
        const existing = catFields.get(field) ?? { field, values: [], mode: "exact" as const };
        existing.mode = value === "family" ? "family" : "exact";
        catFields.set(field, existing);
      } else {
        const existing = catFields.get(rest) ?? { field: rest, values: [], mode: "exact" as const };
        existing.values = value.split(",").filter(Boolean);
        catFields.set(rest, existing);
      }
      continue;
    }

    if (key.startsWith("range.")) {
      const rest = key.slice(6);
      const dotIdx = rest.lastIndexOf(".");
      if (dotIdx < 0) continue;
      const field = rest.slice(0, dotIdx);
      const suffix = rest.slice(dotIdx + 1);
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      const existing = rangeFields.get(field) ?? { field };
      if (suffix === "min") existing.min = num;
      else if (suffix === "max") existing.max = num;
      else if (suffix === "tol") existing.tolerance = num;
      rangeFields.set(field, existing);
      continue;
    }

    if (key.startsWith("presence.")) {
      const field = key.slice(9);
      if (!isPresenceField(field)) continue;
      if (value === "has" || value === "hasnt" || value === "any") {
        spec.presence.push({ field, state: value });
      }
      continue;
    }

    if (key.startsWith("region.")) {
      const rest = key.slice(7);
      if (rest.endsWith(".mode")) {
        const entity = rest.slice(0, -5);
        if (!isPresenceField(entity)) continue;
        const existing = regionFields.get(entity) ?? { entity, regions: [], mode: "any" as const };
        existing.mode = value === "all" ? "all" : "any";
        regionFields.set(entity, existing);
      } else {
        if (!isPresenceField(rest)) continue;
        const existing = regionFields.get(rest) ?? { entity: rest, regions: [], mode: "any" as const };
        existing.regions = value.split(",").filter(Boolean);
        regionFields.set(rest, existing);
      }
      continue;
    }

    if (key.startsWith("text.")) {
      const rest = key.slice(5);
      if (rest.endsWith(".fuzzy")) {
        const field = rest.slice(0, -6);
        const existing = textFields.get(field) ?? { field, query: "", fuzzy: false };
        existing.fuzzy = value === "1" || value === "true";
        textFields.set(field, existing);
      } else {
        const existing = textFields.get(rest) ?? { field: rest, query: "", fuzzy: false };
        existing.query = value;
        textFields.set(rest, existing);
      }
      continue;
    }

    if (key.startsWith("attr.")) {
      const rest = key.slice(5);
      let definitionId: string;
      let kind: "values" | "min" | "max" = "values";
      if (rest.endsWith(".min")) {
        definitionId = rest.slice(0, -4);
        kind = "min";
      } else if (rest.endsWith(".max")) {
        definitionId = rest.slice(0, -4);
        kind = "max";
      } else {
        definitionId = rest;
      }
      // Merge into a single entry per definitionId
      let entry = spec.attribute.find((a) => a.definitionId === definitionId);
      if (!entry) {
        entry = { definitionId, values: [] };
        spec.attribute.push(entry);
      }
      if (kind === "values") {
        entry.values = value.split(",").filter(Boolean);
      } else if (kind === "min") {
        const n = Number(value);
        if (Number.isFinite(n)) entry.min = n;
      } else {
        const n = Number(value);
        if (Number.isFinite(n)) entry.max = n;
      }
      continue;
    }
  }

  spec.categorical = Array.from(catFields.values()).filter((c) => c.values.length > 0);
  spec.range = Array.from(rangeFields.values()).filter(
    (r) => r.min != null || r.max != null,
  );
  spec.region = Array.from(regionFields.values()).filter((r) => r.regions.length > 0);
  spec.text = Array.from(textFields.values()).filter((t) => t.query);
  spec.attribute = spec.attribute.filter(
    (a) => a.values.length > 0 || a.min != null || a.max != null,
  );

  return spec;
}
