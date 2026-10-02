import { describe, expect, it } from "vitest";
import { parseTagQuery, resolveTagQuery, type CatalogTag } from "@/lib/tag-query";

const tag = (id: string, groupSlug: string, opts: Partial<CatalogTag> = {}): CatalogTag => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  slug: id,
  aliases: [],
  parentId: null,
  groupId: `g-${groupSlug}`,
  groupSlug,
  isExclusive: false,
  kind: "DESCRIPTIVE",
  ...opts,
});

const CATALOG: CatalogTag[] = [
  tag("swimwear", "outfit"),
  tag("bikini", "outfit", { parentId: "swimwear" }),
  tag("string", "outfit", { parentId: "bikini" }),
  tag("dress", "outfit"),
  tag("outdoor", "setting", { isExclusive: true, aliases: ["outside"] }),
  tag("studio", "setting", { isExclusive: true }),
  tag("review", "workflow", { kind: "WORKFLOW" }),
  tag("beach", "location"),
  tag("beach-wear", "outfit", { name: "Beach" }),
];

const resolve = (s: string) => resolveTagQuery(parseTagQuery(s).query, CATALOG);
const ids = (r: ReturnType<typeof resolve>, clause = 0, term = 0) =>
  r.all[clause].any[term].parts.flatMap((p) => p.tagIds).sort();

describe("resolveTagQuery", () => {
  it("expands a tag to all its descendants", () => {
    expect(ids(resolve("outfit:swimwear"))).toEqual(["bikini", "string", "swimwear"]);
  });

  it("does not expand an exact term", () => {
    expect(ids(resolve("=outfit:swimwear"))).toEqual(["swimwear"]);
  });

  it("resolves group wildcards", () => {
    expect(ids(resolve("setting:*"))).toEqual(["outdoor", "studio"]);
  });

  it("matches a bare name across groups, by name, alias or slug", () => {
    const r = resolve("beach");
    expect(ids(r)).toEqual(["beach", "beach-wear"]);
    expect(r.all[0].any[0].parts.map((p) => p.groupId).sort()).toEqual(["g-location", "g-outfit"]);
    expect(ids(resolve("outside"))).toEqual(["outdoor"]);
  });

  it("carries exclusivity and workflow kind per group part", () => {
    expect(resolve("outdoor").all[0].any[0].parts[0]).toMatchObject({ isExclusive: true, workflow: false });
    expect(resolve("review").all[0].any[0].parts[0]).toMatchObject({ workflow: true });
  });

  it("reports unknown terms and keeps their clause (it then matches nothing)", () => {
    const r = resolve("nonsense -alsonothing");
    expect(r.unknown).toEqual(["nonsense", "alsonothing"]);
    expect(r.all).toHaveLength(1);
    expect(r.all[0].any[0].parts).toEqual([]);
    expect(r.none).toEqual([]);
  });

  it("keeps the level of each term", () => {
    expect(resolve("@session:outdoor").all[0].any[0].source).toBe("session");
  });
});
