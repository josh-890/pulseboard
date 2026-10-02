import { describe, expect, it } from "vitest";
import {
  cycleTag,
  EMPTY_TAG_QUERY,
  groupMatchMode,
  parseTagQuery,
  serializeTagQuery,
  setClauseSource,
  setGroupMatchMode,
  tagFacetState,
} from "@/lib/tag-query";

const q = (s: string) => parseTagQuery(s).query;
const s = serializeTagQuery;

describe("facet edits", () => {
  it("click includes, tags of one group OR together, groups AND", () => {
    let x = cycleTag(EMPTY_TAG_QUERY, "location", "beach", false);
    x = cycleTag(x, "location", "pool", false);
    x = cycleTag(x, "outfit", "bikini", false);
    expect(s(x)).toBe("location:beach,pool outfit:bikini");
    expect(tagFacetState(x, "location", "pool")).toBe("include");
  });

  it("a second click removes; an emptied clause disappears", () => {
    const x = cycleTag(q("location:beach outfit:bikini"), "location", "beach", false);
    expect(s(x)).toBe("outfit:bikini");
  });

  it("alt-click excludes, and moves an included tag to excluded", () => {
    const x = cycleTag(q("location:beach,pool"), "location", "pool", true);
    expect(s(x)).toBe("location:beach -location:pool");
    expect(tagFacetState(x, "location", "pool")).toBe("exclude");
    expect(s(cycleTag(x, "location", "pool", true))).toBe("location:beach");
  });

  it("switches a group between any and all", () => {
    const all = setGroupMatchMode(q("location:beach,pool"), "location", "all");
    expect(s(all)).toBe("location:beach location:pool");
    expect(groupMatchMode(all, "location")).toBe("all");
    // In "all" mode a new tag becomes its own clause
    expect(s(cycleTag(all, "location", "hotel", false))).toBe("location:beach location:pool location:hotel");
    expect(s(setGroupMatchMode(all, "location", "any"))).toBe("location:beach,pool");
  });

  it("leaves level-specific clauses alone when adding facet tags", () => {
    const x = cycleTag(q("@session:location:beach"), "location", "pool", false);
    expect(s(x)).toBe("@session:location:beach location:pool");
  });

  it("changes a clause's level", () => {
    expect(s(setClauseSource(q("location:beach,pool"), 0, "session"))).toBe("@session:location:beach,pool");
  });
});
