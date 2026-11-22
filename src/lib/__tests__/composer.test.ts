import { describe, expect, it } from "vitest";
import {
  combinationName,
  compositionOf,
  findCombination,
  impliedTags,
  matrixGarments,
  openDraft,
  unsavedChanges,
  tagCounts,
  toggleInComposition,
  EMPTY_COMPOSITION,
  applyCompositionTo,
  eraserOf,
  compositionView,
  passChoice,
  withoutTags,
  presetOnto,
  presetAsComposition,
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

describe("selection (S3)", () => {
  const counts = tagCounts([["standing", "contrapposto", "portrait"], ["standing", "portrait"], ["kneeling"]]);
  const N = 3;
  it("counts direct tags across the photos", () => {
    expect(counts.get("standing")).toBe(2);
    expect(counts.get("kneeling")).toBe(1);
  });

  it("adding a base posture marks the other bases and their refinements for removal", () => {
    expect(toggleInComposition(catalog, EMPTY_COMPOSITION, "lying", counts, N)).toEqual({
      adds: ["lying"],
      removes: ["standing", "kneeling", "contrapposto"],
    });
  });

  it("Shift adds without touching the others; clicking again takes it back with what it caused", () => {
    expect(toggleInComposition(catalog, EMPTY_COMPOSITION, "lying", counts, N, true)).toEqual({ adds: ["lying"], removes: [] });
    const c = toggleInComposition(catalog, EMPTY_COMPOSITION, "lying", counts, N);
    expect(toggleInComposition(catalog, c, "lying", counts, N)).toEqual({ adds: [], removes: [] });
  });

  it("a tag every photo has is removed; an exclusive tag replaces the group's others", () => {
    const all = tagCounts([["portrait"], ["portrait"]]);
    expect(toggleInComposition(catalog, EMPTY_COMPOSITION, "portrait", all, 2)).toEqual({ adds: [], removes: ["portrait"] });
    expect(toggleInComposition(catalog, EMPTY_COMPOSITION, "full-body", all, 2)).toEqual({ adds: ["full-body"], removes: ["portrait"] });
  });

  it("applies to one photo, keeping what it does not touch", () => {
    expect(applyCompositionTo(catalog, ["standing", "contrapposto", "bra"], { adds: ["kneeling"], removes: ["standing"] })).toEqual([
      "bra",
      "kneeling",
    ]);
    expect(eraserOf({ adds: ["bra"], removes: ["panties"] })).toEqual({ adds: [], removes: ["bra"] });
    expect(compositionView({ adds: ["lying"], removes: ["standing"] }, counts).sort()).toEqual(
      ["contrapposto", "kneeling", "lying", "portrait"].sort(),
    );
  });

  it("pass mode replaces the section's tag and drops orphaned refinements", () => {
    const section = new Set(["standing", "kneeling", "lying"]);
    expect(passChoice(catalog, ["standing", "contrapposto", "portrait"], section, "kneeling")).toEqual(["portrait", "kneeling"]);
    expect(passChoice(catalog, ["kneeling"], section, "kneeling")).toEqual(["kneeling"]);
    expect(withoutTags(catalog, ["lying", "on-side", "bra"], ["lying"])).toEqual(["bra"]);
  });
});

describe("presets as clicks (S6)", () => {
  it("onto one photo: a base posture in the preset replaces the photo's", () => {
    expect(presetOnto(catalog, ["sitting-x", "standing", "contrapposto"].filter((t) => catalog.tags[t]), { adds: ["kneeling", "full-body"], removes: [] })).toEqual([
      "kneeling",
      "full-body",
    ]);
  });

  it("as a selection's change: replaces other base postures present, leaves what all have", () => {
    const counts = tagCounts([["standing", "full-body"], ["full-body"]]);
    expect(presetAsComposition(catalog, { adds: ["kneeling", "full-body"], removes: [] }, counts, 2)).toEqual({
      adds: ["kneeling"],
      removes: ["standing"],
    });
  });
});
