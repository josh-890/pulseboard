import { describe, expect, it } from "vitest";
import { applyTagChangeToItems } from "@/lib/gallery-tag-update";
import type { PaletteTag } from "@/lib/services/tag-service";

const tag = (id: string, group: string, isExclusive = false) =>
  ({
    id,
    name: id,
    group: { id: group, name: group, color: "#000", isExclusive },
  }) as unknown as PaletteTag;

const chip = (id: string, group: string) => ({ id, name: id, group: { name: group, color: "#000" } });

describe("applyTagChangeToItems", () => {
  const items = [
    { id: "a", tags: [chip("indoor", "Setting")] },
    { id: "b", tags: undefined },
    { id: "c", tags: [] },
  ];

  it("adds to the selected items only, once", () => {
    const out = applyTagChangeToItems(items, { tag: tag("beach", "Location"), on: true, entityIds: ["a", "b"] });
    expect(out.map((i) => (i.tags ?? []).map((t) => t.id))).toEqual([["indoor", "beach"], ["beach"], []]);
    const again = applyTagChangeToItems(out, { tag: tag("beach", "Location"), on: true, entityIds: ["a"] });
    expect(again[0].tags?.map((t) => t.id)).toEqual(["indoor", "beach"]);
  });

  it("replaces a same-group tag in an exclusive group", () => {
    const out = applyTagChangeToItems(items, { tag: tag("outdoor", "Setting", true), on: true, entityIds: ["a"] });
    expect(out[0].tags?.map((t) => t.id)).toEqual(["outdoor"]);
  });

  it("removes", () => {
    const out = applyTagChangeToItems(items, { tag: tag("indoor", "Setting"), on: false, entityIds: ["a", "c"] });
    expect(out[0].tags).toEqual([]);
    expect(out[2].tags).toEqual([]);
  });
});
