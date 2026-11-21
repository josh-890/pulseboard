import { describe, expect, it } from "vitest";
import {
  combinationName,
  compositionOf,
  findCombination,
  impliedTags,
  matrixGarments,
  openDraft,
  unsavedChanges,
  refinementOptions,
  statesForGarment,
  toggleTag,
  type ComposerCatalog,
  type ComposerTag,
} from "@/lib/composer";

// The Composer's rules (ADR-0042) on a small catalogue:
//   Figure: Base (standing, kneeling, lying) → Refinement (contrapposto ⊂ standing,
//           on-one-knee ⊂ kneeling, on-side ⊂ lying, fetal-position ⊂ on-side)
//   Camera: Framing (exclusive: portrait, full-body)
//   Clothing: Garments (bra, panties), Damage (torn-clothes, torn-bra ⊂ bra + torn-clothes)

const tag = (id: string, groupId: string, parentIds: string[] = []): ComposerTag => ({ id, name: id, description: null, groupId, parentIds });
const tags = [
  tag("standing", "posture"),
  tag("kneeling", "posture"),
  tag("lying", "posture"),
  tag("contrapposto", "detail", ["standing"]),
  tag("on-one-knee", "detail", ["kneeling"]),
  tag("on-side", "detail", ["lying"]),
  tag("fetal-position", "detail", ["on-side"]),
  tag("portrait", "framing"),
  tag("full-body", "framing"),
  tag("bra", "lingerie"),
  tag("panties", "lingerie"),
  tag("torn-clothes", "damage"),
  tag("torn-bra", "damage", ["bra", "torn-clothes"]),
];
const group = (id: string, isExclusive = false) => ({ id, name: id, isExclusive, tagIds: tags.filter((t) => t.groupId === id).map((t) => t.id) });

const catalog: ComposerCatalog = {
  paths: [
    {
      id: "figure",
      name: "Figure",
      tileAspect: "3:4",
      pinned: false,
      sections: [
        { id: "base", name: "Base posture", kind: "TILES", passable: true, groupIds: ["posture"] },
        { id: "ref", name: "Refinement", kind: "REFINEMENT", passable: false, groupIds: ["detail"] },
      ],
    },
    { id: "camera", name: "Camera", tileAspect: "1:1", pinned: true, sections: [{ id: "fr", name: "Framing", kind: "TILES", passable: true, groupIds: ["framing"] }] },
    {
      id: "clothing",
      name: "Clothing",
      tileAspect: "1:1",
      pinned: true,
      sections: [
        { id: "gar", name: "Garments", kind: "TILES", passable: false, groupIds: ["lingerie"] },
        { id: "mx", name: "State matrix", kind: "MATRIX", passable: false, groupIds: ["damage"] },
      ],
    },
  ],
  groups: Object.fromEntries(
    [group("posture"), group("detail"), group("framing", true), group("lingerie"), group("damage")].map((g) => [g.id, g]),
  ),
  tags: Object.fromEntries(tags.map((t) => [t.id, t])),
  stateRules: [
    { stateGroupId: "damage", genericTagId: "torn-clothes", namePattern: "torn-{x}", garmentGroupIds: ["lingerie"], garmentTagIds: [], overrides: { panties: "torn-knickers" } },
  ],
};

describe("toggleTag", () => {
  it("a base posture replaces the other one; Shift adds", () => {
    expect(toggleTag(catalog, ["standing"], "kneeling")).toEqual(["kneeling"]);
    expect(toggleTag(catalog, ["standing"], "kneeling", true)).toEqual(["standing", "kneeling"]);
  });

  it("changing the base drops the refinements only it led to", () => {
    expect(toggleTag(catalog, ["standing", "contrapposto"], "kneeling")).toEqual(["kneeling"]);
    expect(toggleTag(catalog, ["standing", "kneeling", "contrapposto", "on-one-knee"], "standing")).toEqual(["kneeling", "on-one-knee"]);
  });

  it("a refinement at depth stays while its base is held", () => {
    expect(toggleTag(catalog, ["lying"], "fetal-position")).toEqual(["lying", "fetal-position"]);
    expect(toggleTag(catalog, ["lying", "fetal-position"], "lying")).toEqual([]);
  });

  it("an exclusive group replaces; a held tag toggles off", () => {
    expect(toggleTag(catalog, ["portrait", "bra"], "full-body")).toEqual(["bra", "full-body"]);
    expect(toggleTag(catalog, ["portrait"], "portrait")).toEqual([]);
  });
});

describe("refinementOptions / impliedTags", () => {
  it("offers each chosen base its refinements, at any depth", () => {
    const figure = catalog.paths[0];
    expect(refinementOptions(catalog, figure, ["kneeling", "lying"])).toEqual([
      { baseId: "kneeling", tagIds: ["on-one-knee"] },
      { baseId: "lying", tagIds: ["on-side", "fetal-position"] },
    ]);
  });

  it("implies every parent of a combination", () => {
    expect(impliedTags(catalog, ["torn-bra"]).sort()).toEqual(["bra", "torn-clothes"]);
    expect(impliedTags(catalog, ["torn-bra", "bra"])).toEqual(["torn-clothes"]);
  });
});

describe("carry-over", () => {
  const pinned = new Set(["camera", "clothing"]);
  it("offers the pinned paths the photo has nothing in", () => {
    expect(openDraft(catalog, ["kneeling"], ["standing", "full-body", "bra"], pinned)).toEqual({
      draft: ["kneeling", "full-body", "bra"],
      proposed: ["full-body", "bra"],
    });
  });

  it("a path the photo already has stays as it is", () => {
    expect(openDraft(catalog, ["portrait"], ["full-body", "bra"], pinned)).toEqual({ draft: ["portrait", "bra"], proposed: ["bra"] });
  });

  it("the composition is the difference", () => {
    expect(compositionOf(["standing", "portrait"], ["kneeling", "portrait", "bra"])).toEqual({ adds: ["kneeling", "bra"], removes: ["standing"] });
  });
});

describe("unsavedChanges", () => {
  it("counts the user's own edits, not an untouched carried-over offer", () => {
    expect(unsavedChanges(["standing"], ["standing", "full-body"], ["full-body"])).toEqual({ adds: [], removes: [] });
    expect(unsavedChanges(["standing"], ["kneeling", "full-body"], ["full-body"])).toEqual({ adds: ["kneeling"], removes: ["standing"] });
    expect(unsavedChanges([], [], ["full-body"]), "an offer dropped is no loss").toEqual({ adds: [], removes: [] });
  });
});

describe("state matrix", () => {
  it("names a combination by the pattern, or the override", () => {
    const rule = catalog.stateRules[0];
    expect(combinationName(rule, catalog.tags.bra)).toBe("torn-bra");
    expect(combinationName(rule, catalog.tags.panties)).toBe("torn-knickers");
    expect(findCombination(catalog, rule, "bra")?.id).toBe("torn-bra");
    expect(findCombination(catalog, rule, "panties")).toBeNull();
  });

  it("offers states for garments, and rows for garments a combination implies", () => {
    expect(statesForGarment(catalog, "bra").map((r) => r.stateGroupId)).toEqual(["damage"]);
    expect(statesForGarment(catalog, "standing")).toEqual([]);
    expect(matrixGarments(catalog, ["torn-bra", "panties", "standing"])).toEqual(["bra", "panties"]);
  });
});
