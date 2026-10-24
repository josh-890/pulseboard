import { describe, expect, it } from "vitest";
import { imageShownIds, imageShows } from "@/lib/image-shown";
import { leadsFirst } from "@/lib/services/session-contributors";

// Who an image shows (ADR-0023 + support, 2026-10-24): a lead unless hidden,
// someone only appearing only where marked shown.
describe("imageShownIds", () => {
  it("shows the leads and none of the support by default", () => {
    expect(imageShownIds({ sessionCastIds: ["a", "b"], supportCastIds: ["s"] })).toEqual(["a", "b"]);
  });

  it("hides a lead, shows a support person where marked", () => {
    const item = { sessionCastIds: ["a", "b"], hiddenPersonIds: ["b"], supportCastIds: ["s", "t"], shownSupportIds: ["t"] };
    expect(imageShownIds(item)).toEqual(["a", "t"]);
    expect(imageShows(item, "s")).toBe(false);
    expect(imageShows(item, "t")).toBe(true);
  });

  it("ignores a mark for someone no longer support there (stale rows are inert)", () => {
    expect(imageShownIds({ sessionCastIds: ["a"], shownSupportIds: ["x"] })).toEqual(["a"]);
  });

  it("a person both lead and support follows the lead rule", () => {
    expect(imageShownIds({ sessionCastIds: ["a"], hiddenPersonIds: ["a"], supportCastIds: ["a"], shownSupportIds: ["a"] })).toEqual([]);
  });
});

describe("leadsFirst", () => {
  it("puts support after the leads, each keeping its order", () => {
    const list = [
      { id: 1, roleDefinition: { presence: "SUPPORT" } },
      { id: 2, roleDefinition: { presence: "LEAD" } },
      { id: 3, roleDefinition: null },
      { id: 4, roleDefinition: { presence: "SUPPORT" } },
    ];
    expect(leadsFirst(list).map((p) => p.id)).toEqual([2, 3, 1, 4]);
  });
});
