import { describe, expect, it } from "vitest";
import { channelLabel } from "@/lib/channel-label";

// Which of two channel names goes on screen.
//
// `StagingSet.channelName` is what the import file said; `Channel.name` is the
// record. They differ for 97.8 % of staged sets that have a channel — "KATYA
// CLOVER" against "KatyaClover" — and a list rendering the raw string shows one
// channel under two names depending on where the row came from. Nothing is
// actually split: those rows point at one Channel by id.

describe("channelLabel", () => {
  it("prefers the channel record over the import's spelling", () => {
    expect(
      channelLabel({ channelName: "KATYA CLOVER", channel: { name: "KatyaClover" } }),
    ).toBe("KatyaClover");
  });

  // 11 staged sets on xpulse never resolved to a channel. There the file's
  // spelling is the only thing known, and dropping it would leave a blank.
  it("falls back to the import's spelling when nothing resolved", () => {
    expect(channelLabel({ channelName: "KATYA CLOVER", channel: null })).toBe("KATYA CLOVER");
    expect(channelLabel({ channelName: "KATYA CLOVER" })).toBe("KATYA CLOVER");
  });

  it("says so rather than rendering an empty cell", () => {
    expect(channelLabel({ channelName: null, channel: null })).toBe("Unknown Channel");
    expect(channelLabel({})).toBe("Unknown Channel");
  });

  it("uses the record even when both agree", () => {
    expect(channelLabel({ channelName: "MetArt", channel: { name: "MetArt" } })).toBe("MetArt");
  });
});
