import { describe, expect, it } from "vitest";
import { channelDisplay, channelLabel } from "@/lib/channel-label";

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

// The second kind of disagreement, and the one that must survive: two import
// names deliberately mapped to one channel — a base channel and its archive or
// cover feed. 1,955 rows across 42 channels on xpulse. Folding those into the
// canonical name would erase a distinction the operator made on purpose, and
// would hide a wrong mapping ("ALSANGELS" → ALSScan) along with it.
describe("channelDisplay", () => {
  it("says nothing extra when the import merely spelled it differently", () => {
    for (const raw of ["KATYA CLOVER", "katyaclover", "Katya-Clover", "KATYA  CLOVER"]) {
      expect(channelDisplay({ channelName: raw, channel: { name: "KatyaClover" } })).toEqual({
        label: "KatyaClover",
        importedAs: null,
      });
    }
  });

  it("keeps a materially different import name beside the record", () => {
    expect(channelDisplay({ channelName: "ALS ARCHIVE", channel: { name: "ALSScan" } })).toEqual({
      label: "ALSScan",
      importedAs: "ALS ARCHIVE",
    });
    expect(channelDisplay({ channelName: "ONLYTEASE COVERS", channel: { name: "OnlyTease" } }))
      .toEqual({ label: "OnlyTease", importedAs: "ONLYTEASE COVERS" });
  });

  // A mapping that is simply wrong stays visible for the same reason.
  it("shows a name that does not belong to the channel it was mapped to", () => {
    expect(channelDisplay({ channelName: "ALSANGELS", channel: { name: "ALSScan" } }).importedAs)
      .toBe("ALSANGELS");
  });

  // An unresolved row's label already *is* the file's name; repeating it would
  // render "FOO · FOO".
  it("does not repeat itself when nothing resolved", () => {
    expect(channelDisplay({ channelName: "FOO", channel: null })).toEqual({
      label: "FOO",
      importedAs: null,
    });
  });
});
