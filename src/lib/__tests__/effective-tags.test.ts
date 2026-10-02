import { describe, expect, it } from "vitest";
import { resolveEffectiveTags, type TagFact, type TagOrigin } from "@/lib/effective-tags";

const group = (id: string, opts: { isExclusive?: boolean; workflow?: boolean; sortOrder?: number } = {}) => ({
  id,
  name: id,
  color: "#000000",
  isExclusive: opts.isExclusive ?? false,
  kind: opts.workflow ? ("WORKFLOW" as const) : ("DESCRIPTIVE" as const),
  sortOrder: opts.sortOrder ?? 0,
});

const SETTING = group("setting", { isExclusive: true, sortOrder: 0 });
const LOCATION = group("location", { sortOrder: 1 });
const WORKFLOW = group("workflow", { workflow: true, sortOrder: 2 });

const tag = (id: string, g: TagFact["group"], sortOrder = 0): TagFact => ({ id, name: id, parentId: null, sortOrder, group: g });

const SESSION: TagOrigin = { level: "SESSION", id: "s1", label: "Session 1" };
const SET_A: TagOrigin = { level: "SET", id: "a", label: "Set A" };
const SET_B: TagOrigin = { level: "SET", id: "b", label: "Set B" };

const brief = (tags: ReturnType<typeof resolveEffectiveTags>) =>
  tags.map((t) => `${t.id}:${t.source}${t.overridden ? ":overridden" : ""}`);

describe("resolveEffectiveTags", () => {
  it("unions inherited tags of non-exclusive groups with the direct ones", () => {
    const result = resolveEffectiveTags(
      [tag("pool", LOCATION, 1)],
      [{ origin: SESSION, tags: [tag("beach", LOCATION, 0)] }],
    );
    expect(brief(result)).toEqual(["beach:SESSION", "pool:DIRECT"]);
    expect(result[0].origin).toEqual(SESSION);
  });

  it("shows a tag present on several levels once, at the nearest", () => {
    const beach = tag("beach", LOCATION);
    const result = resolveEffectiveTags([beach], [
      { origin: SET_A, tags: [beach] },
      { origin: SESSION, tags: [beach] },
    ]);
    expect(brief(result)).toEqual(["beach:DIRECT"]);
  });

  it("prefers the set over the session when both carry the tag", () => {
    const beach = tag("beach", LOCATION);
    const result = resolveEffectiveTags([], [
      { origin: SESSION, tags: [beach] },
      { origin: SET_A, tags: [beach] },
    ]);
    expect(brief(result)).toEqual(["beach:SET"]);
  });

  it("nearest level wins in an exclusive group: the image's Studio shadows the session's Outdoor", () => {
    const result = resolveEffectiveTags(
      [tag("studio", SETTING, 2)],
      [{ origin: SESSION, tags: [tag("outdoor", SETTING, 1)] }],
    );
    expect(brief(result)).toEqual(["outdoor:SESSION:overridden", "studio:DIRECT"]);
  });

  it("a set shadows its session in an exclusive group", () => {
    const result = resolveEffectiveTags([], [
      { origin: SESSION, tags: [tag("outdoor", SETTING, 1)] },
      { origin: SET_A, tags: [tag("indoor", SETTING, 0)] },
    ]);
    expect(brief(result)).toEqual(["indoor:SET", "outdoor:SESSION:overridden"]);
  });

  it("two sets disagreeing in an exclusive group tie — neither is overridden", () => {
    const result = resolveEffectiveTags([], [
      { origin: SET_A, tags: [tag("indoor", SETTING, 0)] },
      { origin: SET_B, tags: [tag("outdoor", SETTING, 1)] },
    ]);
    expect(brief(result)).toEqual(["indoor:SET", "outdoor:SET"]);
  });

  it("never inherits workflow tags, but keeps direct ones", () => {
    const result = resolveEffectiveTags(
      [tag("review", WORKFLOW, 1)],
      [{ origin: SET_A, tags: [tag("needs-crop", WORKFLOW, 0)] }],
    );
    expect(brief(result)).toEqual(["review:DIRECT"]);
  });

  it("orders by group, then tag sort order", () => {
    const result = resolveEffectiveTags(
      [tag("review", WORKFLOW), tag("pool", LOCATION, 1)],
      [{ origin: SESSION, tags: [tag("indoor", SETTING), tag("beach", LOCATION, 0)] }],
    );
    expect(result.map((t) => t.id)).toEqual(["indoor", "beach", "pool", "review"]);
  });
});
