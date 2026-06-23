import { describe, expect, it } from "vitest";
import { pickOwnerLabelId } from "@/lib/services/label-resolution";

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
