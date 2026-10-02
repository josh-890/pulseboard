import { describe, expect, it } from "vitest";
import { applyCompletion, completionsFor, tokenAtCaret, type CompletionGroup } from "@/lib/tag-query";

const GROUPS: CompletionGroup[] = [
  { slug: "location", name: "Location", color: "#1", tags: [{ slug: "beach", name: "Beach" }, { slug: "pool", name: "Pool" }] },
  { slug: "outfit", name: "Outfit", color: "#2", tags: [{ slug: "bikini", name: "Bikini" }, { slug: "beach-wear", name: "Beach wear" }] },
];

describe("tokenAtCaret", () => {
  it("splits the prefix from the core", () => {
    expect(tokenAtCaret("beach -@set:=loc", 16)).toEqual({ start: 6, end: 16, prefix: "-@set:=", core: "loc" });
    expect(tokenAtCaret("~po bikini", 3)).toMatchObject({ start: 0, end: 3, prefix: "~", core: "po" });
  });
});

describe("completionsFor", () => {
  it("offers predicates, groups and tags for a bare word, name-prefix tags first", () => {
    const c = completionsFor("bea", "", GROUPS, "MEDIA_ITEM").map((x) => x.insert);
    expect(c).toEqual(["location:beach", "outfit:beach-wear"]);
    expect(completionsFor("lo", "", GROUPS, "MEDIA_ITEM").map((x) => x.insert)).toEqual(["location:"]);
    expect(completionsFor("is", "", GROUPS, "MEDIA_ITEM").map((x) => x.insert)).toEqual(["is:fav", "is:untagged"]);
  });

  it("only offers predicates the browser can answer", () => {
    expect(completionsFor("rat", "", GROUPS, "MEDIA_ITEM")).toEqual([]);
    expect(completionsFor("rat", "", GROUPS, "SET").map((x) => x.insert)).toEqual(["rating>="]);
  });

  it("completes inside a group and predicate values", () => {
    expect(completionsFor("location:", "", GROUPS, "SET").map((x) => x.insert)).toEqual([
      "location:*",
      "location:beach",
      "location:pool",
    ]);
    expect(completionsFor("type:v", "", GROUPS, "SET").map((x) => x.insert)).toEqual(["type:video"]);
  });

  it("offers the browser's levels after @", () => {
    expect(completionsFor("@s", "", GROUPS, "SET").map((x) => x.insert)).toEqual(["@set:", "@session:"]);
    expect(completionsFor("@", "", GROUPS, "PERSON")).toEqual([]);
  });
});

describe("applyCompletion", () => {
  it("keeps the prefix and adds a space after a finished term", () => {
    const text = "outfit:bikini -po";
    const r = applyCompletion(text, tokenAtCaret(text, text.length), { insert: "location:pool", label: "Pool" });
    expect(r.text).toBe("outfit:bikini -location:pool ");
    expect(r.caret).toBe(r.text.length);
  });

  it("leaves the caret right after an open key", () => {
    const text = "lo beach";
    const r = applyCompletion(text, tokenAtCaret(text, 2), { insert: "location:", label: "location:" });
    expect(r.text).toBe("location:beach");
    expect(r.caret).toBe(9);
  });
});
