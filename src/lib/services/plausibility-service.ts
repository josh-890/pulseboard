import type { PersonWithCommonAlias } from "@/lib/types";

export type PlausibilityIssue = {
  id: string;
  severity: "warning" | "info";
  category: "identity" | "timeline" | "career" | "physical";
  message: string;
  fixHint?: string;
  fixTab?: string;
  fixAction?: "edit-person";
};

type PersonData = {
  birthdate: Date | null;
  birthdatePrecision: string;
  birthdateModifier?: string;
  status: string;
  activeFrom: Date | null;
  activeFromPrecision: string;
  retiredAt: Date | null;
  retiredAtPrecision: string;
  aliases: { type: string }[];
  personas: { isBaseline: boolean; date: Date | null; datePrecision: string }[];
};

/**
 * Compute plausibility issues for a person. Pure function — no DB queries.
 * Soft warnings only — never blocks saves.
 */
export function computePlausibilityIssues(person: PersonData): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const now = new Date();

  // ── Identity ────────────────────────────────────────────────────────────
  if (!person.birthdate) {
    issues.push({
      id: "no-birthdate",
      severity: "warning",
      category: "identity",
      message: "No birthdate set",
      fixHint: "Add birthdate in Edit Person",
      fixAction: "edit-person",
    });
  } else if (person.birthdatePrecision === "YEAR") {
    issues.push({
      id: "birthdate-year-only",
      severity: "info",
      category: "identity",
      message: "Birthdate has only year precision",
      fixHint: "Add month/day to birthdate",
      fixAction: "edit-person",
    });
  }

  const hasCommonAlias = person.aliases.some((a) => a.type === "common");
  if (!hasCommonAlias) {
    issues.push({
      id: "no-common-alias",
      severity: "warning",
      category: "identity",
      message: "No common alias (display name)",
      fixHint: "Add a common alias",
      fixTab: "aliases",
    });
  }

  // Modifier / precision mismatch
  if (
    person.birthdateModifier === "EXACT" &&
    person.birthdate &&
    (person.birthdatePrecision === "UNKNOWN" || person.birthdatePrecision === "YEAR")
  ) {
    issues.push({
      id: "modifier-precision-mismatch",
      severity: "info",
      category: "identity",
      message: "Birthdate marked as exact but has low precision",
      fixHint: "Set modifier to Approximate or add more date precision",
      fixAction: "edit-person",
    });
  }

  // ── Career ──────────────────────────────────────────────────────────────
  const isActive = person.status === "active";
  const hasActiveFrom = person.activeFrom !== null;
  const hasRetiredAt = person.retiredAt !== null;

  if (isActive && !hasActiveFrom) {
    issues.push({
      id: "no-career-start",
      severity: "info",
      category: "career",
      message: "Active person with no career start date",
      fixHint: "Set Active From in Edit Person",
      fixAction: "edit-person",
    });
  }

  if (isActive && hasRetiredAt) {
    issues.push({
      id: "active-with-retirement",
      severity: "warning",
      category: "career",
      message: "Status is active but retirement date is set",
      fixHint: "Clear retirement date or change status to inactive",
      fixAction: "edit-person",
    });
  }

  if (!isActive && person.status === "inactive" && !hasRetiredAt) {
    issues.push({
      id: "inactive-no-retirement",
      severity: "info",
      category: "career",
      message: "Status is inactive but no retirement date",
      fixHint: "Set Retired At in Edit Person",
      fixAction: "edit-person",
    });
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  if (person.birthdate) {
    // Future birthdate
    if (person.birthdate > now) {
      issues.push({
        id: "future-birthdate",
        severity: "warning",
        category: "timeline",
        message: "Birthdate is in the future",
        fixHint: "Check birthdate in Edit Person",
        fixAction: "edit-person",
      });
    }

    // Age > 100
    const ageYears = now.getFullYear() - person.birthdate.getFullYear();
    if (ageYears > 100 && person.birthdatePrecision !== "UNKNOWN") {
      issues.push({
        id: "age-over-100",
        severity: "warning",
        category: "timeline",
        message: `Current age would be ${ageYears} — verify birthdate`,
        fixHint: "Check birthdate in Edit Person",
        fixAction: "edit-person",
      });
    }

    // Career before birth
    if (person.activeFrom && person.activeFrom < person.birthdate) {
      issues.push({
        id: "career-before-birth",
        severity: "warning",
        category: "timeline",
        message: "Career start is before birthdate",
        fixHint: "Check Active From date",
        fixAction: "edit-person",
      });
    }

    // Career started too young (< 16)
    if (person.activeFrom && person.activeFrom >= person.birthdate) {
      const startAge = person.activeFrom.getFullYear() - person.birthdate.getFullYear();
      if (startAge < 16) {
        issues.push({
          id: "career-start-too-young",
          severity: "warning",
          category: "timeline",
          message: `Career start age is ${startAge} — verify dates`,
          fixHint: "Check birthdate or Active From",
          fixAction: "edit-person",
        });
      }
    }

    // Persona dates before birth
    const personaBeforeBirth = person.personas.some(
      (p) => !p.isBaseline && p.date && p.date < person.birthdate!,
    );
    if (personaBeforeBirth) {
      issues.push({
        id: "persona-before-birth",
        severity: "warning",
        category: "timeline",
        message: "A persona has a date before birthdate",
        fixHint: "Check persona dates in Appearance tab",
        fixTab: "appearance",
      });
    }
  }

  // Retired before start
  if (person.activeFrom && person.retiredAt && person.retiredAt < person.activeFrom) {
    issues.push({
      id: "retired-before-start",
      severity: "warning",
      category: "timeline",
      message: "Retirement date is before career start",
      fixHint: "Check Active From and Retired At dates",
      fixAction: "edit-person",
    });
  }

  // Undated non-baseline personas
  const undatedPersonas = person.personas.filter(
    (p) => !p.isBaseline && !p.date,
  );
  if (undatedPersonas.length > 0) {
    issues.push({
      id: "undated-personas",
      severity: "info",
      category: "timeline",
      message: `${undatedPersonas.length} persona(s) with no date`,
      fixHint: "Add dates to personas in Appearance tab",
      fixTab: "appearance",
    });
  }

  return issues;
}

/**
 * Quick plausibility count for list view. Uses only data in PersonWithCommonAlias.
 * Returns 0 for clean persons.
 */
export function getQuickPlausibilityCount(person: PersonWithCommonAlias): number {
  let count = 0;
  if (!person.birthdate) count++;
  if (!person.commonAlias) count++;
  if (person.status === "active" && person.retiredAt !== null) count++;
  return count;
}
