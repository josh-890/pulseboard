import { describe, expect, it } from "vitest";
import { parseTagQuery, serializeTagQuery } from "@/lib/tag-query";

const parse = (s: string) => parseTagQuery(s).query;

describe("parseTagQuery", () => {
  it("reads bare names and group:tag terms as AND clauses", () => {
    expect(parse("beach outfit:bikini")).toEqual({
      all: [
        { any: [{ group: null, tag: "beach", exact: false, source: "any" }] },
        { any: [{ group: "outfit", tag: "bikini", exact: false, source: "any" }] },
      ],
      none: [],
      predicates: [],
    });
  });

  it("reads a comma list as one OR clause", () => {
    expect(parse("location:beach,pool").all).toEqual([
      {
        any: [
          { group: "location", tag: "beach", exact: false, source: "any" },
          { group: "location", tag: "pool", exact: false, source: "any" },
        ],
      },
    ]);
  });

  it("joins every ~token into one OR clause, appended last", () => {
    const q = parse("~pool framing:portrait ~outfit:bikini");
    expect(q.all).toHaveLength(2);
    expect(q.all[1].any.map((t) => t.tag)).toEqual(["pool", "bikini"]);
  });

  it("reads exclusion, exact, level and wildcard", () => {
    const q = parse("-setting:studio @session:=mood-light:night outfit:*");
    expect(q.none).toEqual([{ group: "setting", tag: "studio", exact: false, source: "any" }]);
    expect(q.all[0].any[0]).toEqual({ group: "mood-light", tag: "night", exact: true, source: "session" });
    expect(q.all[1].any[0]).toEqual({ group: "outfit", tag: "*", exact: false, source: "any" });
  });

  it("keeps quoted names together and lower-cases", () => {
    expect(parse('"Golden Hour" mood-light:"Low key"').all.map((c) => c.any[0])).toEqual([
      { group: null, tag: "golden hour", exact: false, source: "any" },
      { group: "mood-light", tag: "low key", exact: false, source: "any" },
    ]);
  });

  it("separates predicates from tags", () => {
    const q = parse("is:fav rating>=4 beach");
    expect(q.predicates).toEqual([
      { key: "is", op: ":", value: "fav" },
      { key: "rating", op: ">=", value: "4" },
    ]);
    expect(q.all).toHaveLength(1);
  });

  it("reports what it cannot read instead of guessing", () => {
    const { query, errors } = parseTagQuery("@shelf:beach outfit:");
    expect(query.all).toEqual([]);
    expect(errors).toHaveLength(2);
  });
});

describe("serializeTagQuery", () => {
  const roundTrips = [
    "beach",
    "location:beach,pool",
    "outfit:* -setting:studio",
    "@session:=mood-light:night",
    '"golden hour"',
    "framing:portrait ~pool ~outfit:bikini",
    "beach is:fav rating>=4",
  ];
  for (const s of roundTrips) {
    it(`round-trips ${s}`, () => {
      expect(serializeTagQuery(parse(s))).toBe(s);
    });
  }

  it("is stable: parse(serialize(q)) equals q", () => {
    const q = parse('location:beach,pool -outfit:=swimwear @image:framing:close-up ~night ~"golden hour"');
    expect(parse(serializeTagQuery(q))).toEqual(q);
  });
});
