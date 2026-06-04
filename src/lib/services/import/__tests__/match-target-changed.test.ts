import { describe, expect, it } from "vitest";
import { matchTargetChanged } from "@/lib/services/import/match-refresh-service";

// Regression contract for the confirm-vs-recompute fix: a recompute may only
// overwrite the cached match fields when the matched TARGET changed. An
// unchanged target must be left alone so a user-confirmed match (recorded as
// matchConfidence=1.0) survives the recompute the promote route runs.
describe("matchTargetChanged", () => {
  it("is false when the target is unchanged (preserves a confirmed match)", () => {
    expect(matchTargetChanged("set-X", "set-X")).toBe(false);
  });

  it("is false when there was and still is no match", () => {
    expect(matchTargetChanged(null, null)).toBe(false);
  });

  it("is true when a new match appears (null → id)", () => {
    expect(matchTargetChanged(null, "set-X")).toBe(true);
  });

  it("is true when the match disappears (id → null)", () => {
    expect(matchTargetChanged("set-X", null)).toBe(true);
  });

  it("is true when the target moves to a different Set (the 'Grecian Sirens' stale-cache case)", () => {
    expect(matchTargetChanged("set-X", "set-Y")).toBe(true);
  });
});
