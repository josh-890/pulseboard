import { describe, it, expect } from "vitest";
import { actValue, applySharedExtras, effectiveExtras, explainActValue, formatIntensity, intensityRows, isIntensityStep, overridesFor, sessionIntensity, suggestScenarioIds } from "@/lib/intensity";

const semi = { id: "semi", points: 1, groupId: "loc", isMax: false };
const pub = { id: "pub", points: 2, groupId: "loc", isMax: false };
const first = { id: "first", points: 1, groupId: null, isMax: false };
const outdoors = { id: "out", points: 0.5, groupId: null, isMax: false };
const max = { id: "max", points: 0, groupId: null, isMax: true };
const byId = new Map([semi, pub, first, outdoors, max].map((e) => [e.id, e]));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe("effectiveExtras", () => {
  it("inherits the session extras", () => {
    expect(ids(effectiveExtras([semi, first], [], byId))).toEqual(["first", "semi"]);
  });
  it("adds an extra", () => {
    expect(ids(effectiveExtras([semi], [{ extraId: "out", mode: "ADD" }], byId))).toEqual(["out", "semi"]);
  });
  it("a grouped extra replaces the inherited choice in its group", () => {
    expect(ids(effectiveExtras([semi, first], [{ extraId: "pub", mode: "ADD" }], byId))).toEqual(["first", "pub"]);
  });
  it("drops an inherited extra", () => {
    expect(ids(effectiveExtras([semi, first], [{ extraId: "first", mode: "DROP" }], byId))).toEqual(["semi"]);
  });
});

describe("actValue", () => {
  it("adds points to the level", () => {
    expect(actValue(5, [semi, first])).toBe(7);
    expect(actValue(6.5, [outdoors])).toBe(7);
  });
  it("never goes above 9.5", () => {
    expect(actValue(7, [pub, first])).toBe(9.5);
    expect(actValue(9.5, [outdoors])).toBe(9.5);
  });
  it("Max sets 10 whatever the sum", () => {
    expect(actValue(0.5, [max])).toBe(10);
  });
});

describe("sessionIntensity / format / steps", () => {
  it("is the highest act", () => {
    expect(sessionIntensity([5, 9.5, 7])).toBe(9.5);
    expect(sessionIntensity([])).toBeNull();
  });
  it("formats", () => {
    expect(formatIntensity(7)).toBe("7");
    expect(formatIntensity(6.5)).toBe("6.5");
  });
  it("accepts 0.5 steps only", () => {
    expect(isIntensityStep(2.5)).toBe(true);
    expect(isIntensityStep(0)).toBe(true);
    expect(isIntensityStep(2.3)).toBe(false);
    expect(isIntensityStep(-1)).toBe(false);
  });
});

describe("intensityRows", () => {
  it("whole values, 9.5 and Max; half steps only when described or used", () => {
    expect(intensityRows([], [], false)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9.5, 10]);
    expect(intensityRows([2.5], [6.5], false)).toEqual([0, 1, 2, 2.5, 3, 4, 5, 6, 6.5, 7, 8, 9, 9.5, 10]);
  });
  it("all half steps when asked", () => {
    expect(intensityRows([], [], true)).toHaveLength(21);
  });
});

describe("suggestScenarioIds", () => {
  it("alone → Glamour and Solo", () => {
    expect(suggestScenarioIds("female", [])).toEqual(["dsit-glamour", "dsit-solo"]);
  });
  it("one other → G-G or G-B", () => {
    expect(suggestScenarioIds("female", ["female"])).toEqual(["dsit-gg"]);
    expect(suggestScenarioIds("female", ["male"])).toEqual(["dsit-gb"]);
    expect(suggestScenarioIds("male", ["female"])).toEqual(["dsit-gb"]);
  });
  it("two or more others → Group", () => {
    expect(suggestScenarioIds("female", ["female", null])).toEqual(["dsit-group"]);
  });
  it("an unknown sex suggests nothing", () => {
    expect(suggestScenarioIds("female", [null])).toEqual([]);
    expect(suggestScenarioIds("male", ["male"])).toEqual([]);
  });
});

describe("overridesFor", () => {
  it("adds what the act wants beyond the session, drops what it does without", () => {
    expect(overridesFor(["semi", "first"], ["pub"])).toEqual([
      { extraId: "pub", mode: "ADD" },
      { extraId: "semi", mode: "DROP" },
      { extraId: "first", mode: "DROP" },
    ]);
    expect(overridesFor(["semi"], ["semi"])).toEqual([]);
  });
});

describe("sessionIntensity with Max", () => {
  const max = { id: "max", points: 0, groupId: null, isMax: true };
  it("Max among the session extras makes the session 10, even without acts", () => {
    expect(sessionIntensity([], [max])).toBe(10);
    expect(sessionIntensity([4], [max])).toBe(10);
    expect(sessionIntensity([4], [])).toBe(4);
  });
});

describe("explainActValue", () => {
  const semi = { id: "semi", name: "Semi-public", points: 1, groupId: "loc", isMax: false };
  const priv = { id: "priv", name: "Private", points: 0, groupId: "loc", isMax: false };
  const pub = { id: "pub", name: "Public", points: 2, groupId: "loc", isMax: false };
  const max = { id: "max", name: "Max", points: 0, groupId: null, isMax: true };
  it("sums the level and the extras that add points", () => {
    expect(explainActValue("Topless", 5, [semi, priv])).toBe("Topless 5 + Semi-public 1 = 6");
    expect(explainActValue("Topless", 5, [])).toBe("Topless 5");
  });
  it("says when the cap bites, and when Max decides", () => {
    expect(explainActValue("Spreads", 8.5, [pub])).toBe("Spreads 8.5 + Public 2 = 10.5 → capped at 9.5");
    expect(explainActValue("Spreads", 8.5, [pub, max])).toBe("Max → 10");
  });
});

describe("applySharedExtras", () => {
  const groups: Record<string, string | null> = { semi: "loc", pub: "loc", priv: "loc", first: null, max: null };
  const groupOf = (id: string) => groups[id] ?? null;
  it("adds what joined the common set to everyone, replacing their choice in its group", () => {
    // Anna had semi, Bea priv; nothing common in Location; Public chosen for both
    expect(applySharedExtras(["semi"], [], ["pub"], groupOf)).toEqual(["pub"]);
    expect(applySharedExtras(["priv", "first"], [], ["pub"], groupOf).sort()).toEqual(["first", "pub"]);
  });
  it("removes only what was common and left; leaves the rest as each had it", () => {
    expect(applySharedExtras(["semi", "first"], ["first"], [], groupOf)).toEqual(["semi"]);
  });
});
