import { describe, expect, it } from "vitest";
import { isTagName, qualifiedTagName, tagNameKey, toTagName } from "@/lib/tag-names";

describe("toTagName — the one spelling (kebab-case)", () => {
  it("lower-cases and hyphenates words", () => {
    expect(toTagName("Natural light")).toBe("natural-light");
    expect(toTagName("  Golden   Hour ")).toBe("golden-hour");
    expect(toTagName("Close-up")).toBe("close-up");
    expect(toTagName("upload-HD")).toBe("upload-hd");
    expect(toTagName("golden_hour")).toBe("golden-hour");
  });

  it("transliterates umlauts, drops accents, reads & as and", () => {
    expect(toTagName("Rote Nägel")).toBe("rote-naegel");
    expect(toTagName("Straße")).toBe("strasse");
    expect(toTagName("Café")).toBe("cafe");
    expect(toTagName("B&W")).toBe("b-and-w");
  });

  it("keeps digits, trims stray hyphens, yields empty for no letters", () => {
    expect(toTagName("Skimpy2Nude")).toBe("skimpy2nude");
    expect(toTagName("--x--")).toBe("x");
    expect(toTagName("!!!")).toBe("");
  });

  it("knows a name already in the spelling", () => {
    expect(isTagName("nailpolish-red")).toBe(true);
    expect(isTagName("Nailpolish red")).toBe(false);
    expect(isTagName("")).toBe(false);
  });
});

describe("qualifiedTagName", () => {
  it("puts the thing first, in the one spelling", () => {
    expect(qualifiedTagName("red", "Outfit color")).toBe("outfit-color-red");
    expect(qualifiedTagName("Red", "Outfit color")).toBe("outfit-color-red");
  });

  it("keys names like the catalogue's slug", () => {
    expect(tagNameKey("Red Nails!")).toBe("red-nails");
  });
});
