import { describe, expect, it } from "vitest";
import { pickOwnerLabelId, resolveOwnerLabelId } from "@/lib/services/label-resolution";

/**
 * Phase 0 characterisation (ADR-0020): pins today's "owning label = highest
 * confidence ChannelLabelMap" rule, the one set import uses for Session.labelId
 * and the one Phase 1 will backfill Channel.labelId from. These must never drift.
 */
describe("pickOwnerLabelId (owner-label resolution)", () => {
  it("returns undefined when the channel has no label maps", () => {
    expect(pickOwnerLabelId([])).toBeUndefined();
  });

  it("returns the sole map's label (the normal single-owner case)", () => {
    expect(pickOwnerLabelId([{ labelId: "lab_ddf", confidence: 1.0 }])).toBe("lab_ddf");
  });

  it("picks the highest-confidence label when several maps exist", () => {
    expect(
      pickOwnerLabelId([
        { labelId: "lab_low", confidence: 0.4 },
        { labelId: "lab_owner", confidence: 1.0 },
        { labelId: "lab_mid", confidence: 0.7 },
      ]),
    ).toBe("lab_owner");
  });

  it("is independent of input order", () => {
    const maps = [
      { labelId: "lab_owner", confidence: 0.9 },
      { labelId: "lab_other", confidence: 0.2 },
    ];
    expect(pickOwnerLabelId(maps)).toBe("lab_owner");
    expect(pickOwnerLabelId([...maps].reverse())).toBe("lab_owner");
  });

  it("keeps the first map on an exact confidence tie (stable)", () => {
    expect(
      pickOwnerLabelId([
        { labelId: "lab_first", confidence: 1.0 },
        { labelId: "lab_second", confidence: 1.0 },
      ]),
    ).toBe("lab_first");
  });
});

/**
 * Phase 2 (ADR-0020): set import reads Channel.labelId; the map fallback only
 * fires when the FK is unset (channels created on prod between the DB migration
 * and the app rebuild). Removed in Phase 5.
 */
describe("resolveOwnerLabelId (FK-first with map fallback)", () => {
  it("returns the FK when set, ignoring the maps entirely", () => {
    expect(
      resolveOwnerLabelId("lab_fk", [{ labelId: "lab_map", confidence: 1.0 }]),
    ).toBe("lab_fk");
  });

  it("falls back to the highest-confidence map when the FK is null", () => {
    expect(
      resolveOwnerLabelId(null, [
        { labelId: "lab_low", confidence: 0.3 },
        { labelId: "lab_owner", confidence: 1.0 },
      ]),
    ).toBe("lab_owner");
  });

  it("treats undefined FK the same as null (fallback)", () => {
    expect(resolveOwnerLabelId(undefined, [{ labelId: "lab_map", confidence: 1.0 }])).toBe(
      "lab_map",
    );
  });

  it("returns undefined when FK is null and there are no maps", () => {
    expect(resolveOwnerLabelId(null, [])).toBeUndefined();
  });
});
