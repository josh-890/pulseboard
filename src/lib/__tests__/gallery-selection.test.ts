import { describe, expect, it } from "vitest";
import {
  applyRange,
  groupSelectionState,
  invertWithin,
  pruneTo,
} from "@/lib/gallery-selection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("applyRange", () => {
  it("selects from the anchor to the target, in either direction", () => {
    expect([...applyRange(new Set(["b"]), ORDER, { id: "b", selected: true }, "d")].sort())
      .toEqual(["b", "c", "d"]);
    expect([...applyRange(new Set(["d"]), ORDER, { id: "d", selected: true }, "b")].sort())
      .toEqual(["b", "c", "d"]);
  });

  it("gives the range the anchor's state — a deselecting anchor clears the run", () => {
    const all = new Set(ORDER);
    expect([...applyRange(all, ORDER, { id: "b", selected: false }, "d")].sort())
      .toEqual(["a", "e"]);
  });

  it("keeps what lies outside the range", () => {
    const res = applyRange(new Set(["a", "e"]), ORDER, { id: "b", selected: true }, "c");
    expect([...res].sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("an anchor no longer visible acts on the target alone", () => {
    expect([...applyRange(new Set(), ORDER, { id: "gone", selected: true }, "c")]).toEqual(["c"]);
  });
});

describe("invertWithin / pruneTo", () => {
  it("inverts only among the visible images", () => {
    expect([...invertWithin(new Set(["a", "hidden"]), ORDER)]).toEqual(["b", "c", "d", "e"]);
  });

  it("drops selected images that are no longer visible", () => {
    expect([...pruneTo(new Set(["a", "hidden"]), ORDER)]).toEqual(["a"]);
  });
});

describe("groupSelectionState", () => {
  it("reports all / some / none", () => {
    expect(groupSelectionState(new Set(["a", "b"]), ["a", "b"])).toBe("all");
    expect(groupSelectionState(new Set(["a"]), ["a", "b"])).toBe("some");
    expect(groupSelectionState(new Set(), ["a", "b"])).toBe("none");
  });
});
