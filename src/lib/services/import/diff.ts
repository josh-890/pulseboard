// ADR-0009: re-import is a review-driven merge.
//
// Pure helper that compares the import file's parsed data against the
// matched person's current state and produces a per-row decision shape.
// Stored as JSON on ImportItem.decisions; consumed by the review UI; read
// by importPerson() to apply the user-decided Accept set.
//
// "Absence is information": rows where DB has no value and import has a
// value (fill-gap) DO surface — the user explicitly chose absence might be
// deliberate. Only rows where DB and import are identical are skipped here.

export type DecisionDestination = "on-date" | "dateless" | "baseline";
export type DecisionAction = "accept" | "decline";

export type ScalarDecisionRow = {
  slug: string;
  name: string;
  dbValue: string | null;
  dbIsVerifiedUnknown: boolean;
  importValue: string;
  // Verbatim source string for slugs whose parsed value loses information —
  // currently only `breast_size`, where the parser collapses "Small (Real)"
  // into cup="B" + status="natural" and the raw text would otherwise be
  // discarded. Written to ScalarDelta.notes by applyReimportDecisions so
  // provenance survives the re-import. Optional so old saved decisions JSON
  // (predating this field) reads without TypeScript narrowing complaints.
  importNotes?: string | null;
  // Default destination — fill-gap → baseline; true conflict → on-date.
  defaultDestination: DecisionDestination;
  decision: DecisionAction | null;
  chosenDestination: DecisionDestination | null;
};

export type AliasDecisionRow = {
  kind: "common" | "birth";
  itemKey: string;
  importLabel: string;
  decision: DecisionAction | null;
};

export type PersonColumnField =
  | "birthdate"
  | "nationality"
  | "activeFrom"
  | "retiredAt"
  | "bio"
  | "sexAtBirth"
  | "birthPlace";

export type PersonColumnDecisionRow = {
  field: PersonColumnField;
  dbValue: string | null;
  importValue: string;
  decision: DecisionAction | null;
};

export type ImportItemDecisions = {
  scalars: ScalarDecisionRow[];
  aliases: AliasDecisionRow[];
  personColumns: PersonColumnDecisionRow[];
};

import { IMPORT_SCALAR_ATTRS } from "./scalar-attrs";

// Normaliser used for alias keys + dedup. Aligns with normalizeForSearch
// — kept self-contained here to keep diff.ts pure (no DB / locale deps).
export function normaliseAliasKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type MatchedPersonSnapshot = {
  // Person columns
  birthdate: Date | null;
  birthdatePrecision: string | null;
  nationality: string | null;
  activeFrom: Date | null;
  retiredAt: Date | null;
  bio: string | null;
  sexAtBirth: string | null;
  birthPlace: string | null;
  // Aliases keyed by normalised name, with the flags we care about.
  aliases: { name: string; isCommon: boolean; isBirth: boolean }[];
  // Baseline-era values per catalog slug + verified-unknown flag.
  baselineScalars: Map<string, { value: string; isVerifiedUnknown: boolean }>;
};

export type ImportPayload = {
  // Person-column shapes (after the parser has translated month names,
  // resolved nationality codes, etc. — i.e. the same shape the import
  // executor would write).
  birthdateIso?: string | null;
  birthdatePrecision?: string;
  nationality?: string;
  activeFromIso?: string | null;
  retiredAtIso?: string | null;
  bio?: string;
  sexAtBirth?: string;
  birthPlace?: string;
  // Aliases the file proposes.
  commonName?: string;
  birthName?: string;
  // Catalog scalar attribute values (per slug). Missing slug = nothing in
  // the file for that attr.
  scalars: Record<string, string>;
  // Optional verbatim source string per slug. Only populated where the
  // parsed value loses information (currently only breast_size). Written
  // to ScalarDelta.notes by applyReimportDecisions.
  scalarNotes?: Record<string, string>;
};

/**
 * Build a decision-shape from an ImportPayload + the matched person's
 * current snapshot. Identical rows are skipped (no decision needed). All
 * other rows are returned with `decision: null` until the user picks.
 */
export function computeImportDiff(
  payload: ImportPayload,
  matched: MatchedPersonSnapshot,
): ImportItemDecisions {
  const scalars: ScalarDecisionRow[] = [];
  for (const { slug, name } of IMPORT_SCALAR_ATTRS) {
    const importValue = (payload.scalars[slug] ?? "").trim();
    if (importValue === "") continue;
    const dbEntry = matched.baselineScalars.get(slug);
    const dbValue = dbEntry?.value ?? null;
    const dbIsVerifiedUnknown = dbEntry?.isVerifiedUnknown ?? false;
    // Identical → skip (case A).
    if (dbValue === importValue && !dbIsVerifiedUnknown) continue;
    // Fill-gap → baseline default; conflict → on-date default.
    const defaultDestination: DecisionDestination =
      dbValue == null && !dbIsVerifiedUnknown ? "baseline" : "on-date";
    scalars.push({
      slug,
      name,
      dbValue,
      dbIsVerifiedUnknown,
      importValue,
      importNotes: payload.scalarNotes?.[slug] ?? null,
      defaultDestination,
      decision: null,
      chosenDestination: null,
    });
  }

  const aliases: AliasDecisionRow[] = [];
  const dbAliasKeys = new Set(
    matched.aliases.map((a) => normaliseAliasKey(a.name)),
  );
  if (payload.commonName) {
    const key = normaliseAliasKey(payload.commonName);
    if (!dbAliasKeys.has(key)) {
      aliases.push({ kind: "common", itemKey: key, importLabel: payload.commonName, decision: null });
    }
  }
  if (payload.birthName) {
    const key = normaliseAliasKey(payload.birthName);
    if (!dbAliasKeys.has(key)) {
      aliases.push({ kind: "birth", itemKey: key, importLabel: payload.birthName, decision: null });
    }
  }

  const personColumns: PersonColumnDecisionRow[] = [];
  const addColumn = (
    field: PersonColumnField,
    dbValue: string | null,
    importValue: string | null | undefined,
  ) => {
    const iv = (importValue ?? "").trim();
    if (iv === "") return;
    if (dbValue === iv) return;
    personColumns.push({ field, dbValue, importValue: iv, decision: null });
  };
  addColumn(
    "birthdate",
    matched.birthdate ? matched.birthdate.toISOString().slice(0, 10) : null,
    payload.birthdateIso ?? null,
  );
  addColumn("nationality", matched.nationality, payload.nationality);
  addColumn(
    "activeFrom",
    matched.activeFrom ? matched.activeFrom.toISOString().slice(0, 10) : null,
    payload.activeFromIso ?? null,
  );
  addColumn(
    "retiredAt",
    matched.retiredAt ? matched.retiredAt.toISOString().slice(0, 10) : null,
    payload.retiredAtIso ?? null,
  );
  addColumn("bio", matched.bio, payload.bio);
  addColumn("sexAtBirth", matched.sexAtBirth, payload.sexAtBirth);
  addColumn("birthPlace", matched.birthPlace, payload.birthPlace);

  return { scalars, aliases, personColumns };
}

/**
 * True when every decision row in the structure has been resolved
 * (decision is non-null). Drives the status transition gate
 * PENDING_ATTRIBUTE_REVIEW → READY_TO_IMPORT.
 */
export function allDecisionsMade(decisions: ImportItemDecisions): boolean {
  for (const row of decisions.scalars) {
    if (row.decision == null) return false;
    if (row.decision === "accept" && row.chosenDestination == null) return false;
  }
  for (const row of decisions.aliases) {
    if (row.decision == null) return false;
  }
  for (const row of decisions.personColumns) {
    if (row.decision == null) return false;
  }
  return true;
}

/**
 * True when there are zero rows to decide on. Used so the matcher can
 * fast-track items whose import data is fully identical to DB — no need
 * to leave them in PENDING_ATTRIBUTE_REVIEW.
 */
export function isEmptyDiff(decisions: ImportItemDecisions): boolean {
  return (
    decisions.scalars.length === 0 &&
    decisions.aliases.length === 0 &&
    decisions.personColumns.length === 0
  );
}
