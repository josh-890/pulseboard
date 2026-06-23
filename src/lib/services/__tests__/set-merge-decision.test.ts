import { describe, expect, it } from "vitest";
import { setMergeDecision, type SetMergeIdentity } from "@/lib/services/set-merge-service";

/**
 * ADR-0020 Phase 4: the merge guard re-keys from raw channel equality onto the
 * owning production Label + SetType.
 *   block   — conflicting externalId / different SetType (siblings) / different owning label
 *   confirm — same label, same type, different channel (import-born vs archive-born)
 *   allow   — no conflict
 * Null owning label falls back to the legacy channel-identity rule.
 */
const base = (over: Partial<SetMergeIdentity> = {}): SetMergeIdentity => ({
  externalId: null,
  channelId: "chn_1",
  channelLabelId: "lab_1",
  type: "photo",
  title: "Set",
  ...over,
});

describe("setMergeDecision", () => {
  it("allows same channel + same label + same type", () => {
    expect(setMergeDecision(base(), base()).kind).toBe("allow");
  });

  it("blocks conflicting externalId first", () => {
    const d = setMergeDecision(base({ externalId: "x1" }), base({ externalId: "x2" }));
    expect(d.kind).toBe("block");
    if (d.kind === "block") expect(d.reason).toContain("externalId");
  });

  it("blocks photo↔video (split siblings) even with same label", () => {
    const d = setMergeDecision(base({ type: "photo" }), base({ type: "video" }));
    expect(d.kind).toBe("block");
    if (d.kind === "block") expect(d.reason).toContain("siblings");
  });

  it("blocks different owning labels (cross-producer)", () => {
    const d = setMergeDecision(
      base({ channelLabelId: "lab_a", channelId: "chn_a" }),
      base({ channelLabelId: "lab_b", channelId: "chn_b" }),
    );
    expect(d.kind).toBe("block");
    if (d.kind === "block") expect(d.reason).toContain("different production labels");
  });

  it("CONFIRMS same label across different channels (the ADR-0020 relaxation)", () => {
    const d = setMergeDecision(
      base({ channelLabelId: "lab_ddf", channelId: "chn_handsonhardcore" }),
      base({ channelLabelId: "lab_ddf", channelId: "chn_ddfbusty" }),
    );
    expect(d.kind).toBe("confirm");
    if (d.kind === "confirm") expect(d.reason).toContain("different channels");
  });

  it("allows same label + same channel without confirmation", () => {
    expect(
      setMergeDecision(
        base({ channelLabelId: "lab_ddf", channelId: "chn_x" }),
        base({ channelLabelId: "lab_ddf", channelId: "chn_x" }),
      ).kind,
    ).toBe("allow");
  });

  describe("null owning label → legacy channel-identity fallback", () => {
    it("blocks different channels when a label is unknown", () => {
      const d = setMergeDecision(
        base({ channelLabelId: null, channelId: "chn_a" }),
        base({ channelLabelId: null, channelId: "chn_b" }),
      );
      expect(d.kind).toBe("block");
      if (d.kind === "block") expect(d.reason).toContain("different channels");
    });

    it("allows same channel when the label is unknown", () => {
      expect(
        setMergeDecision(
          base({ channelLabelId: null, channelId: "chn_a" }),
          base({ channelLabelId: null, channelId: "chn_a" }),
        ).kind,
      ).toBe("allow");
    });

    it("never treats two null labels as a shared label", () => {
      // Same channel → allow (fallback); but distinct channels must NOT confirm-merge.
      const d = setMergeDecision(
        base({ channelLabelId: null, channelId: "chn_a" }),
        base({ channelLabelId: null, channelId: "chn_b" }),
      );
      expect(d.kind).not.toBe("confirm");
    });
  });
});
