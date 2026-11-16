import { describe, expect, it } from "vitest";
import { applyBulkShown, imageBackgroundIds, imageFocusIds, imageFocuses, imageShownIds, imageShows, type ShownSource } from "@/lib/image-shown";
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

// Focus (ADR-0039): who the image is about — for the showcase; shown stays the fact.
describe("imageFocusIds", () => {
  it("every shown lead is the focus by default, no support is", () => {
    const item = { sessionCastIds: ["a", "b"], supportCastIds: ["s"], shownSupportIds: ["s"] };
    expect(imageFocusIds(item)).toEqual(["a", "b"]);
    expect(imageBackgroundIds(item)).toEqual(["s"]);
  });

  it("a lead in the shot only stays shown but is not the focus", () => {
    const item = { sessionCastIds: ["a", "b"], backgroundPersonIds: ["b"] };
    expect(imageShows(item, "b")).toBe(true);
    expect(imageFocuses(item, "b")).toBe(false);
    expect(imageFocusIds(item)).toEqual(["a"]);
    expect(imageBackgroundIds(item)).toEqual(["b"]);
  });

  it("support marked as the focus counts, only where also shown", () => {
    const item = { sessionCastIds: ["a"], supportCastIds: ["s", "t"], shownSupportIds: ["s"], focusSupportIds: ["s", "t"] };
    expect(imageFocusIds(item)).toEqual(["a", "s"]);
  });

  it("a hidden lead is neither shown nor the focus, whatever the background mark", () => {
    const item = { sessionCastIds: ["a"], hiddenPersonIds: ["a"], backgroundPersonIds: ["a"] };
    expect(imageFocusIds(item)).toEqual([]);
    expect(imageBackgroundIds(item)).toEqual([]);
  });

  it("stale marks are inert", () => {
    expect(imageFocusIds({ sessionCastIds: ["a"], backgroundPersonIds: ["x"], focusSupportIds: ["y"] })).toEqual(["a"]);
  });
});

describe("applyBulkShown", () => {
  const item: ShownSource = { sessionCastIds: ["a"], hiddenPersonIds: ["a"], supportCastIds: ["s"] };
  it("background shows a hidden lead in the shot, and support in the shot", () => {
    const a = applyBulkShown(item, "a", "background");
    expect(imageShownIds(a)).toEqual(["a"]);
    expect(imageBackgroundIds(a)).toEqual(["a"]);
    const s = applyBulkShown(item, "s", "background");
    expect(imageBackgroundIds(s)).toEqual(["s"]);
  });
  it("focus undoes background, makes support the focus; hide clears every mark", () => {
    const a = applyBulkShown(applyBulkShown(item, "a", "background"), "a", "focus");
    expect(imageFocusIds(a)).toEqual(["a"]);
    const s = applyBulkShown(item, "s", "focus");
    expect(imageFocusIds(s)).toEqual(["s"]);
    const gone = applyBulkShown(s, "s", "hide");
    expect(gone.shownSupportIds).toEqual([]);
    expect(gone.focusSupportIds).toEqual([]);
  });
  it("show keeps a lead's background mark", () => {
    const a = applyBulkShown({ sessionCastIds: ["a"], backgroundPersonIds: ["a"] }, "a", "show");
    expect(imageBackgroundIds(a)).toEqual(["a"]);
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
