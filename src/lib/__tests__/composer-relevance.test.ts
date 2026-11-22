import { describe, expect, it } from "vitest";
import {
  applyCombination,
  facetView,
  nextFocusFacet,
  pathVisible,
  relevanceOf,
  suggestCombinations,
  toggleTag,
  type ComposerCatalog,
  type ComposerTag,
  type RelevanceIndex,
} from "@/lib/composer";

// ADR-0043: context relevance (value → facet → path within a context, the
// strictest across contexts), ONE facets, focus flow, combination suggestions.
//
//   Figure:  base (sitting, standing) · seat (legs-hanging, on-floor) · knees (knee-up, knees-up)
//            · hands (hand-on-hip) · named (seiza ⊂ sitting + folded) · legs (folded)
//   Camera:  framing (full-body, close-up) · region (hands-region)

const tag = (id: string, groupId: string, parentIds: string[] = []): ComposerTag => ({ id, name: id, description: null, groupId, parentIds });
const tags = [
  tag("sitting", "base"),
  tag("standing", "base"),
  tag("legs-hanging", "seat"),
  tag("on-floor", "seat"),
  tag("knee-up", "knees"),
  tag("knees-up", "knees"),
  tag("hand-on-hip", "hands"),
  tag("folded", "legs"),
  tag("seiza", "named", ["sitting", "folded"]),
  tag("full-body", "framing"),
  tag("close-up", "framing"),
  tag("hands-region", "region"),
];
const group = (id: string, choice: "ONE" | "MANY" = "MANY") => ({
  id,
  name: id,
  isExclusive: false,
  choice,
  tagIds: tags.filter((t) => t.groupId === id).map((t) => t.id),
});

const relevance: RelevanceIndex = {
  sitting: { "GROUP:seat": "POSSIBLE", "TAG:legs-hanging": "TYPICAL", "TAG:on-floor": "TYPICAL", "GROUP:knees": "TYPICAL" },
  standing: { "GROUP:seat": "IMPOSSIBLE" },
  // a close-up hides the facets it cannot show — on facet level, so a region can bring hands back
  "close-up": { "GROUP:base": "IMPOSSIBLE", "GROUP:seat": "IMPOSSIBLE", "GROUP:knees": "IMPOSSIBLE", "GROUP:legs": "IMPOSSIBLE" },
  "hands-region": { "GROUP:hands": "TYPICAL" },
  "full-body": { "PATH:camera": "POSSIBLE" },
};

const catalog: ComposerCatalog = {
  paths: [
    {
      id: "figure",
      name: "Figure",
      tileAspect: "3:4",
      pinned: false,
      personal: true,
      sections: [
        { id: "s-base", name: "Base", kind: "TILES", passable: true, groupIds: ["base"] },
        { id: "s-seat", name: "Seat", kind: "TILES", passable: false, groupIds: ["seat"] },
        { id: "s-knees", name: "Knees", kind: "TILES", passable: false, groupIds: ["knees"] },
        { id: "s-legs", name: "Legs", kind: "TILES", passable: false, groupIds: ["legs"] },
        { id: "s-hands", name: "Hands", kind: "TILES", passable: false, groupIds: ["hands"] },
        { id: "s-named", name: "Named", kind: "TILES", passable: false, groupIds: ["named"] },
      ],
    },
    {
      id: "camera",
      name: "Camera",
      tileAspect: "1:1",
      pinned: true,
      sections: [{ id: "s-fr", name: "Framing", kind: "TILES", passable: true, groupIds: ["framing", "region"] }],
    },
  ],
  groups: Object.fromEntries(
    [group("base", "ONE"), group("seat", "ONE"), group("knees", "ONE"), group("hands"), group("legs"), group("named"), group("framing", "ONE"), group("region")].map((g) => [
      g.id,
      g,
    ]),
  ),
  tags: Object.fromEntries(tags.map((t) => [t.id, t])),
  stateRules: [],
  relevance,
};

describe("relevanceOf", () => {
  it("within a context the most specific row answers; no say means possible", () => {
    expect(relevanceOf(catalog, ["sitting"], { kind: "TAG", id: "legs-hanging" })).toBe("TYPICAL"); // own row
    expect(relevanceOf(catalog, ["sitting"], { kind: "TAG", id: "knee-up" })).toBe("TYPICAL"); // facet's row
    expect(relevanceOf(catalog, [], { kind: "TAG", id: "knee-up" })).toBe("POSSIBLE");
    expect(relevanceOf(catalog, ["hands-region"], { kind: "TAG", id: "knee-up" }), "a context without a row has no say").toBe("POSSIBLE");
  });

  it("across contexts the strictest wins: a close-up cannot be overruled by a base posture", () => {
    expect(relevanceOf(catalog, ["sitting", "close-up"], { kind: "TAG", id: "legs-hanging" })).toBe("IMPOSSIBLE");
    expect(relevanceOf(catalog, ["standing"], { kind: "TAG", id: "on-floor" })).toBe("IMPOSSIBLE");
  });

  it("a region brings a facet back that the framing leaves alone", () => {
    expect(relevanceOf(catalog, ["close-up", "hands-region"], { kind: "TAG", id: "hand-on-hip" })).toBe("TYPICAL");
  });

  it("paths: visible unless every context hides them", () => {
    expect(pathVisible(catalog, ["close-up"], "figure")).toBe(true); // hidden facet by facet, not as a whole
    expect(pathVisible({ ...catalog, relevance: { x: { "PATH:figure": "IMPOSSIBLE" } } }, ["x"], "figure")).toBe(false);
  });
});

describe("facetView", () => {
  it("typical first, possible behind more, impossible out; held values always show", () => {
    expect(facetView(catalog, ["sitting"], "seat")).toEqual({ groupId: "seat", level: "POSSIBLE", shown: ["legs-hanging", "on-floor"], more: [], typical: true });
    expect(facetView(catalog, ["sitting"], "knees").shown).toEqual(["knee-up", "knees-up"]);
    expect(facetView(catalog, ["standing"], "seat").shown).toEqual([]);
    expect(facetView(catalog, ["standing"], "seat", ["on-floor"]).shown, "a held value never vanishes").toEqual(["on-floor"]);
  });

  it("nothing typical: the possible values show at once (no empty facet without a base)", () => {
    expect(facetView(catalog, [], "hands")).toEqual({ groupId: "hands", level: "POSSIBLE", shown: ["hand-on-hip"], more: [], typical: false });
  });
});

describe("ONE facets, focus, combinations", () => {
  it("a ONE facet replaces; Shift adds; MANY toggles", () => {
    expect(toggleTag(catalog, ["knee-up"], "knees-up")).toEqual(["knees-up"]);
    expect(toggleTag(catalog, ["knee-up"], "knees-up", true)).toEqual(["knee-up", "knees-up"]);
    expect(toggleTag(catalog, ["hand-on-hip"], "hand-on-hip")).toEqual([]);
  });

  it("focus moves to the first facet with something typical and nothing chosen", () => {
    const figure = catalog.paths[0];
    expect(nextFocusFacet(catalog, figure, ["sitting"], ["sitting"])).toBe("seat");
    expect(nextFocusFacet(catalog, figure, ["sitting"], ["sitting", "on-floor"])).toBe("knees");
    expect(nextFocusFacet(catalog, figure, ["sitting"], ["sitting", "on-floor", "knee-up"])).toBeNull();
  });

  it("suggests a named form when all its parts are chosen; taking it replaces the parts", () => {
    expect(suggestCombinations(catalog, ["sitting", "folded", "hand-on-hip"])).toEqual(["seiza"]);
    expect(suggestCombinations(catalog, ["sitting"])).toEqual([]);
    expect(applyCombination(catalog, ["sitting", "folded", "hand-on-hip"], "seiza")).toEqual(["hand-on-hip", "seiza"]);
  });
});
