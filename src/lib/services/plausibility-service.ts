import type { PersonWithCommonAlias, ParticipationConfidence } from "@/lib/types";

export type PlausibilityIssue = {
  id: string;
  severity: "warning" | "info";
  category: "identity" | "timeline" | "career" | "physical";
  message: string;
  fixHint?: string;
  fixTab?: string;
  fixAction?: "edit-person";
};

type ContributionData = {
  confidence: ParticipationConfidence;
  sessionDate: Date | null;
  sessionDatePrecision: string;
  // ADR-0004 / Phase F: optional link to the Era the person was in at the
  // shoot. When set, plausibility cross-checks the session date against the
  // Era's member-date range.
  eraId?: string | null;
};

type EraData = {
  id?: string;
  isBaseline: boolean;
  date: Date | null;
  datePrecision: string;
  scalarDeltas?: { date: Date | null; datePrecision: string }[];
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
  aliases: { isCommon: boolean }[];
  eras: EraData[];
  contributions?: ContributionData[];
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

  const hasCommonAlias = person.aliases.some((a) => a.isCommon);
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
    const ageYears = now.getUTCFullYear() - person.birthdate.getUTCFullYear();
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
      const startAge = person.activeFrom.getUTCFullYear() - person.birthdate.getUTCFullYear();
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

    // Era anchor date before birth
    const eraBeforeBirth = person.eras.some(
      (e) => !e.isBaseline && e.date && e.date < person.birthdate!,
    );
    if (eraBeforeBirth) {
      issues.push({
        id: "era-before-birth",
        severity: "warning",
        category: "timeline",
        message: "An era is dated before birthdate",
        fixHint: "Check era dates in Appearance tab",
        fixTab: "appearance",
      });
    }

    // Scalar delta dated before birth (hard — birth is the absolute origin)
    const deltasBeforeBirth = person.eras
      .flatMap((e) => e.scalarDeltas ?? [])
      .filter(
        (d) =>
          d.date &&
          d.datePrecision !== "UNKNOWN" &&
          d.date < person.birthdate!,
      );
    if (deltasBeforeBirth.length > 0) {
      issues.push({
        id: "delta-before-birth",
        severity: "warning",
        category: "timeline",
        message: `${deltasBeforeBirth.length} change(s) dated before birthdate`,
        fixHint: "Check change dates in Appearance tab",
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

  // Undated non-baseline eras
  const undatedEras = person.eras.filter(
    (p) => !p.isBaseline && !p.date,
  );
  if (undatedEras.length > 0) {
    issues.push({
      id: "undated-eras",
      severity: "info",
      category: "timeline",
      message: `${undatedEras.length} era(s) with no date`,
      fixHint: "Add dates to eras in Appearance tab",
      fixTab: "appearance",
    });
  }

  // ── Participation vs birth & career start ──────────────────────────────
  // Birth is the absolute origin — any participation before it is a hard bug,
  // regardless of confidence.
  if (person.birthdate && person.contributions) {
    const partsBeforeBirth = person.contributions.filter(
      (c) =>
        c.sessionDate &&
        c.sessionDatePrecision !== "UNKNOWN" &&
        c.sessionDate < person.birthdate!,
    );
    if (partsBeforeBirth.length > 0) {
      issues.push({
        id: "participation-before-birth",
        severity: "warning",
        category: "timeline",
        message: `${partsBeforeBirth.length} participation(s) dated before birthdate`,
        fixHint: "Verify session dates or birthdate",
        fixTab: "career",
      });
    }
  }

  // Career start is a soft boundary — confirmed/probable participation before
  // activeFrom is suspicious but may just mean activeFrom needs widening.
  if (person.activeFrom && person.activeFromPrecision !== "UNKNOWN" && person.contributions) {
    const partsBeforeActive = person.contributions.filter(
      (c) =>
        (c.confidence === "CONFIRMED" || c.confidence === "PROBABLE") &&
        c.sessionDate &&
        c.sessionDatePrecision !== "UNKNOWN" &&
        c.sessionDate < person.activeFrom!,
    );
    if (partsBeforeActive.length > 0) {
      issues.push({
        id: "participation-before-active",
        severity: "info",
        category: "timeline",
        message: `${partsBeforeActive.length} confirmed/probable participation(s) before career start`,
        fixHint: "Adjust Active From or verify session dates",
        fixTab: "career",
      });
    }
  }

  // ── Contribution ↔ Era mismatch (ADR-0004 / Phase F) ───────────────────
  // The user pinned a contribution to an Era. If the session date falls
  // outside that Era's member-date range, either the pin or the session date
  // is wrong — flag it for review.
  if (person.contributions?.some((c) => c.eraId)) {
    // Build a Map of eraId → {anchor + max(member dates)} for range checks.
    const eraRanges = new Map<string, { min: Date | null; max: Date | null; isBaseline: boolean }>();
    for (const era of person.eras) {
      if (!era.id) continue;
      const dates = (era.scalarDeltas ?? []).map((d) => d.date).filter((d): d is Date => d !== null);
      if (era.date) dates.push(era.date);
      const min = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
      const max = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
      eraRanges.set(era.id, { min, max, isBaseline: era.isBaseline });
    }
    const mismatches = person.contributions.filter((c) => {
      if (!c.eraId || !c.sessionDate || c.sessionDatePrecision === "UNKNOWN") return false;
      const range = eraRanges.get(c.eraId);
      if (!range || range.isBaseline) return false; // baseline always "contains" any date
      if (!range.min || !range.max) return false;
      return c.sessionDate < range.min || c.sessionDate > range.max;
    });
    if (mismatches.length > 0) {
      issues.push({
        id: "contribution-era-mismatch",
        severity: "info",
        category: "timeline",
        message: `${mismatches.length} participation(s) pinned to an era that doesn't cover the session date`,
        fixHint: "Re-pick the era on the contribution or verify the session date",
        fixTab: "career",
      });
    }
  }

  // TODO(E2 follow-up): overlapping-eras — flag when two non-baseline Eras'
  // member-date ranges intersect. Deferred until Era exposes an explicit range
  // (derived from members per ADR-0001) rather than just an anchor date.

  return issues;
}

/**
 * Quick plausibility count for list view. Delegates to computePlausibilityIssues
 * with available list-view data. Era-related checks are skipped (empty array).
 * Returns 0 for clean persons.
 */
export function getQuickPlausibilityCount(person: PersonWithCommonAlias): number {
  const aliases: { isCommon: boolean }[] = [];
  if (person.commonAlias) aliases.push({ isCommon: true });

  return computePlausibilityIssues({
    birthdate: person.birthdate,
    birthdatePrecision: person.birthdatePrecision,
    birthdateModifier: person.birthdateModifier,
    status: person.status,
    activeFrom: person.activeFrom,
    activeFromPrecision: person.activeFromPrecision,
    retiredAt: person.retiredAt,
    retiredAtPrecision: person.retiredAtPrecision,
    aliases,
    eras: [],
  }).length;
}
