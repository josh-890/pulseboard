import { describe, expect, it } from "vitest";
import { setMergeBlockReason, type SetMergeIdentity } from "@/lib/services/set-merge-service";

/**
 * Phase 0 characterisation (ADR-0020): pins TODAY's merge identity guard so Phase 4
 * can prove exactly what it changes. Current rule: block on conflicting externalId,
 * then block on differing channelId. Phase 4 re-keys the channel check onto the
 * owning Label + SetType — these expectations change there, deliberately, not before.
 */
const base = (over: Partial<SetMergeIdentity> = {}): SetMergeIdentity => ({
  externalId: null,
  channelId: null,
  title: "Some Set",
  ...over,
});

describe("setMergeBlockReason (current channel-keyed guard)", () => {
  it("allows when neither identity column conflicts", () => {
    expect(setMergeBlockReason(base(), base())).toBeNull();
  });

  it("allows same channel on both sides", () => {
    expect(
      setMergeBlockReason(base({ channelId: "chn_1" }), base({ channelId: "chn_1" })),
    ).toBeNull();
  });

  it("allows when only one side has a channel (null does not conflict)", () => {
    expect(
      setMergeBlockReason(base({ channelId: "chn_1" }), base({ channelId: null })),
    ).toBeNull();
  });

  it("BLOCKS different channels — the case ADR-0020 Phase 4 will relax for same-label", () => {
    const reason = setMergeBlockReason(
      base({ channelId: "chn_handsonhardcore", title: "A" }),
      base({ channelId: "chn_ddf", title: "B" }),
    );
    expect(reason).toContain("different channels");
  });

  it("blocks conflicting externalId before channel is even considered", () => {
    const reason = setMergeBlockReason(
      base({ externalId: "ext_1", channelId: "chn_1" }),
      base({ externalId: "ext_2", channelId: "chn_1" }),
    );
    expect(reason).toContain("conflicting externalId");
  });

  it("allows when only one side has an externalId", () => {
    expect(
      setMergeBlockReason(base({ externalId: "ext_1" }), base({ externalId: null })),
    ).toBeNull();
  });
});
