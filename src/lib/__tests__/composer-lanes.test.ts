import { describe, expect, it } from "vitest";
import type { ComposerCatalog, ComposerTag } from "@/lib/composer";
import { laneWrites, personalTagIds, photoDraftOf, toggleInLane, unattributed, personsDirty } from "@/lib/composer-lanes";

// ADR-0043 person lanes: Figure is personal, Camera is the photo's.
const tag = (id: string, groupId: string): ComposerTag => ({ id, name: id, description: null, groupId, parentIds: [] });
const tags = [tag("standing", "base"), tag("kneeling", "base"), tag("hand-on-hip", "hands"), tag("full-body", "framing")];
const catalog: ComposerCatalog = {
  paths: [
    { id: "figure", name: "Figure", tileAspect: "3:4", pinned: false, personal: true, sections: [{ id: "s1", name: "Base", kind: "TILES", passable: true, groupIds: ["base", "hands"] }] },
    { id: "camera", name: "Camera", tileAspect: "1:1", pinned: true, sections: [{ id: "s2", name: "Shot", kind: "TILES", passable: true, groupIds: ["framing"] }] },
  ],
  groups: {
    base: { id: "base", name: "Posture", isExclusive: false, choice: "ONE", tagIds: ["standing", "kneeling"] },
    hands: { id: "hands", name: "Hands", isExclusive: false, tagIds: ["hand-on-hip"] },
    framing: { id: "framing", name: "Framing", isExclusive: true, choice: "ONE", tagIds: ["full-body"] },
  },
  tags: Object.fromEntries(tags.map((t) => [t.id, t])),
  stateRules: [],
};
const personal = personalTagIds(catalog);

describe("person lanes", () => {
  it("personal paths only", () => {
    expect([...personal].sort()).toEqual(["hand-on-hip", "kneeling", "standing"]);
  });

  it("no one shown: one photo-level write, as before", () => {
    expect(laneWrites(catalog, { own: ["standing"], ownPersons: {}, draft: ["kneeling", "full-body"], personDrafts: {}, shown: [] })).toEqual([
      { personId: null, adds: ["kneeling", "full-body"], removes: ["standing"] },
    ]);
  });

  it("solo: personal adds are hers, older unattributed tags are given to her, removals are the photo's", () => {
    const w = laneWrites(catalog, { own: ["standing", "hand-on-hip"], ownPersons: {}, draft: ["kneeling", "hand-on-hip", "full-body"], personDrafts: {}, shown: ["anna"] });
    expect(w).toEqual([
      { personId: null, adds: ["full-body"], removes: ["standing"] },
      { personId: "anna", adds: ["kneeling", "hand-on-hip"], removes: [] },
    ]);
    expect(laneWrites(catalog, { own: ["kneeling"], ownPersons: { anna: ["kneeling"] }, draft: ["kneeling"], personDrafts: {}, shown: ["anna"] })).toEqual([]);
  });

  it("duo: a ONE facet holds per person; each person's change is written as hers", () => {
    let draft: string[] = [];
    let anna: string[] = [];
    let bea: string[] = [];
    ({ draft, personDraft: anna } = toggleInLane(catalog, personal, draft, anna, "standing", false));
    ({ draft, personDraft: bea } = toggleInLane(catalog, personal, draft, bea, "kneeling", false));
    ({ draft, personDraft: bea } = toggleInLane(catalog, personal, draft, bea, "standing", false)); // replaces kneeling for Bea only
    ({ draft, personDraft: anna } = toggleInLane(catalog, personal, draft, anna, "full-body", false)); // the photo's
    expect(anna).toEqual(["standing"]);
    expect(bea).toEqual(["standing"]);
    expect(draft).toEqual(["full-body"]);
    const personDrafts = { anna, bea };
    expect(photoDraftOf(personal, draft, [], personDrafts)).toEqual(["full-body", "standing"]);
    expect(laneWrites(catalog, { own: [], ownPersons: {}, draft, personDrafts, shown: ["anna", "bea"] })).toEqual([
      { personId: null, adds: ["full-body"], removes: [] },
      { personId: "anna", adds: ["standing"], removes: [] },
      { personId: "bea", adds: ["standing"], removes: [] },
    ]);
    expect(personsDirty({ anna: ["standing"], bea: ["standing"], carla: ["kneeling"] }, personDrafts), "a person not shown is not a change").toBe(false);
  });

  it("tags written before lanes wait to be given to someone", () => {
    expect(unattributed(personal, ["standing", "full-body", "kneeling"], { anna: ["kneeling"] })).toEqual(["standing"]);
  });
});
