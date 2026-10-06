import { describe, expect, it } from "vitest";
import { qualifiedTagName, tagNameKey } from "@/lib/tag-names";

describe("qualifiedTagName", () => {
  it("puts the thing first, in the style the name is written in", () => {
    expect(qualifiedTagName("red", "Outfit color")).toBe("outfit-color-red");
    expect(qualifiedTagName("Red", "Outfit color")).toBe("Outfit color Red");
  });

  it("keys names like the catalogue's slug", () => {
    expect(tagNameKey("Red Nails!")).toBe("red-nails");
  });
});
