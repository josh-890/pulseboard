import { describe, expect, it } from "vitest";
import {
  decidePromoteMatch,
  type PromoteMatchInputs,
} from "@/lib/services/import/import-executor";

// Guard contract for the promote-time match validator. Every path that is not a
// verified exact same-label match must yield create-new — never a silent enrich.
// Hardened after the 2026-07-14 "Good Morning → EuroNudes Set 1" cross-label
// mis-merge, where a stale 0.7 title match was laundered into an enrich.

const base: PromoteMatchInputs = {
  matchedExists: true,
  stagingExternalId: "588458",
  matchedExternalId: "588458",
  stagingLabelId: "label-A",
  matchedLabelId: "label-A",
  cachedConfidence: 1.0,
};

describe("decidePromoteMatch", () => {
  it("enriches on an exact (1.0), same-label, externalId-agreeing match", () => {
    expect(decidePromoteMatch(base)).toEqual({ kind: "enrich" });
  });

  it("enriches at 1.0 even when labels are unresolved (exact match implies same set)", () => {
    const d = decidePromoteMatch({
      ...base,
      stagingLabelId: null,
      matchedLabelId: null,
    });
    expect(d).toEqual({ kind: "enrich" });
  });

  // ── Guard 1: matched Set gone ──────────────────────────────────────────────
  it("creates-new and clears the cache when the matched Set no longer exists", () => {
    const d = decidePromoteMatch({ ...base, matchedExists: false });
    expect(d).toEqual({ kind: "create-new", clearCache: true });
  });

  // ── Guard 2: externalId drift ──────────────────────────────────────────────
  it("creates-new and clears the cache on externalId drift (both present, differ)", () => {
    const d = decidePromoteMatch({
      ...base,
      stagingExternalId: "588458",
      matchedExternalId: "999999",
    });
    expect(d).toEqual({ kind: "create-new", clearCache: true });
  });

  it("does not fail Guard 2 when one side lacks an externalId", () => {
    expect(
      decidePromoteMatch({ ...base, matchedExternalId: null }),
    ).toEqual({ kind: "enrich" });
    expect(
      decidePromoteMatch({ ...base, stagingExternalId: null }),
    ).toEqual({ kind: "enrich" });
  });

  // ── Guard 3: owning-label mismatch (the incident) ──────────────────────────
  it("creates-new and clears the cache on a cross-label match, even at 1.0", () => {
    const d = decidePromoteMatch({
      ...base,
      stagingLabelId: "AmourAngels",
      matchedLabelId: "Aphroditas",
      cachedConfidence: 1.0,
    });
    expect(d).toEqual({ kind: "create-new", clearCache: true });
  });

  it("reproduces the incident shape: stale cross-label match with null confidence", () => {
    const d = decidePromoteMatch({
      matchedExists: true,
      stagingExternalId: "588458",
      matchedExternalId: null, // EuroNudes set had no externalId pre-merge
      stagingLabelId: "AmourAngels",
      matchedLabelId: "Aphroditas",
      cachedConfidence: null, // Bug B fed null confidence to the guard
    });
    // Must NOT enrich — the very merge we are fixing.
    expect(d.kind).toBe("create-new");
  });

  it("does not enforce Guard 3 when a label is unresolved (defers to confidence)", () => {
    // Unresolved staging label + exact match → still enriches (no false refusal).
    expect(
      decidePromoteMatch({ ...base, stagingLabelId: null }),
    ).toEqual({ kind: "enrich" });
    expect(
      decidePromoteMatch({ ...base, matchedLabelId: null }),
    ).toEqual({ kind: "enrich" });
  });

  // ── Guard 4: confidence must be exactly 1.0 ────────────────────────────────
  it("creates-new WITHOUT clearing on a fuzzy (<1.0) same-label match (keep suggestion)", () => {
    const d = decidePromoteMatch({ ...base, cachedConfidence: 0.7 });
    expect(d).toEqual({ kind: "create-new", clearCache: false });
  });

  it("creates-new WITHOUT clearing on a null-confidence same-label match", () => {
    const d = decidePromoteMatch({ ...base, cachedConfidence: null });
    expect(d).toEqual({ kind: "create-new", clearCache: false });
  });

  it("treats a near-1.0 score as fuzzy (0.95 is not exact)", () => {
    const d = decidePromoteMatch({ ...base, cachedConfidence: 0.95 });
    expect(d).toEqual({ kind: "create-new", clearCache: false });
  });
});
