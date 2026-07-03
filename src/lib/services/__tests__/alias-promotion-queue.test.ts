import { describe, expect, it } from "vitest";
import {
  buildAliasPromotionCandidates,
  type QueueCreditRow,
} from "@/lib/services/alias-service";

// Helper to build a credit row with sensible defaults.
function row(over: Partial<QueueCreditRow> & Pick<QueueCreditRow, "resolvedPersonId" | "nameNorm" | "rawName">): QueueCreditRow {
  return {
    set: { channelId: "chan1", channel: { name: "ChannelX" } },
    resolvedPerson: { icgId: "ICG-1", aliases: [{ nameNorm: "wiska", isCommon: true, channelLinks: [] }] },
    ...over,
  } as QueueCreditRow;
}

describe("buildAliasPromotionCandidates", () => {
  it("groups matching credits and counts sets", () => {
    const rows = [
      row({ resolvedPersonId: "p1", nameNorm: "mila", rawName: "Mila" }),
      row({ resolvedPersonId: "p1", nameNorm: "mila", rawName: "Mila" }),
    ];
    const out = buildAliasPromotionCandidates(rows, new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ personId: "p1", channelId: "chan1", name: "Mila", setCount: 2 });
  });

  it("excludes the common name", () => {
    const rows = [row({ resolvedPersonId: "p1", nameNorm: "wiska", rawName: "Wiska" })];
    expect(buildAliasPromotionCandidates(rows, new Set())).toHaveLength(0);
  });

  it("excludes used-names already linked as an alias on that channel", () => {
    const rows = [
      row({
        resolvedPersonId: "p1",
        nameNorm: "mila",
        rawName: "Mila",
        resolvedPerson: {
          icgId: "ICG-1",
          aliases: [
            { nameNorm: "wiska", isCommon: true, channelLinks: [] },
            { nameNorm: "mila", isCommon: false, channelLinks: [{ channelId: "chan1" }] },
          ],
        },
      }),
    ];
    expect(buildAliasPromotionCandidates(rows, new Set())).toHaveLength(0);
  });

  it("still proposes an alias that exists but is NOT linked to this channel", () => {
    const rows = [
      row({
        resolvedPersonId: "p1",
        nameNorm: "mila",
        rawName: "Mila",
        resolvedPerson: {
          icgId: "ICG-1",
          aliases: [
            { nameNorm: "wiska", isCommon: true, channelLinks: [] },
            { nameNorm: "mila", isCommon: false, channelLinks: [{ channelId: "otherChan" }] },
          ],
        },
      }),
    ];
    expect(buildAliasPromotionCandidates(rows, new Set())).toHaveLength(1);
  });

  it("excludes dismissed tuples", () => {
    const rows = [row({ resolvedPersonId: "p1", nameNorm: "mila", rawName: "Mila" })];
    const dismissed = new Set(["p1|chan1|mila"]);
    expect(buildAliasPromotionCandidates(rows, dismissed)).toHaveLength(0);
  });

  it("separates the same used-name on different channels", () => {
    const rows = [
      row({ resolvedPersonId: "p1", nameNorm: "mila", rawName: "Mila" }),
      row({
        resolvedPersonId: "p1",
        nameNorm: "mila",
        rawName: "Mila",
        set: { channelId: "chan2", channel: { name: "ChannelY" } },
      }),
    ];
    const out = buildAliasPromotionCandidates(rows, new Set());
    expect(out).toHaveLength(2);
  });

  it("sorts by set count descending", () => {
    const rows = [
      row({ resolvedPersonId: "p1", nameNorm: "mila", rawName: "Mila" }),
      row({ resolvedPersonId: "p2", nameNorm: "lena", rawName: "Lena", resolvedPerson: { icgId: "ICG-2", aliases: [{ nameNorm: "nadia", isCommon: true, channelLinks: [] }] } }),
      row({ resolvedPersonId: "p2", nameNorm: "lena", rawName: "Lena", resolvedPerson: { icgId: "ICG-2", aliases: [{ nameNorm: "nadia", isCommon: true, channelLinks: [] }] } }),
    ];
    const out = buildAliasPromotionCandidates(rows, new Set());
    expect(out[0].name).toBe("Lena");
    expect(out[0].setCount).toBe(2);
  });
});
