import { describe, it, expect } from "vitest";
import { actValue, applySharedExtras, formatPoints, isPointsStep, intensityColor, intensityFilterOptions, intensityTextColor, withIntensityFilter, effectiveExtras, explainActValue, formatIntensity, intensityRows, isIntensityStep, overridesFor, sessionIntensity, suggestScenarioIds, presetAdditions, intensityReview, sessionReview, presetValue, pickLastTime, usualPreset } from "@/lib/intensity";

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
    expect(actValue(5, [semi, first], 10)).toBe(7);
    expect(actValue(6.5, [outdoors], 10)).toBe(7);
  });
  it("never goes above 9.5", () => {
    expect(actValue(7, [pub, first], 10)).toBe(9.5);
    expect(actValue(9.5, [outdoors], 10)).toBe(9.5);
  });
  it("Max sets 10 whatever the sum", () => {
    expect(actValue(0.5, [max], 10)).toBe(10);
  });
});

describe("sessionIntensity / format / steps", () => {
  it("is the highest act", () => {
    expect(sessionIntensity([5, 9.5, 7], [], 10)).toBe(9.5);
    expect(sessionIntensity([], [], 10)).toBeNull();
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
    expect(intensityRows([], [], false, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9.5, 10]);
    expect(intensityRows([2.5], [6.5], false, 10)).toEqual([0, 1, 2, 2.5, 3, 4, 5, 6, 6.5, 7, 8, 9, 9.5, 10]);
  });
  it("all half steps when asked", () => {
    expect(intensityRows([], [], true, 10)).toHaveLength(21);
  });
});

describe("suggestScenarioIds", () => {
  it("alone → Solo", () => {
    expect(suggestScenarioIds("female", [])).toEqual(["dsit-solo"]);
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
    expect(sessionIntensity([], [max], 10)).toBe(10);
    expect(sessionIntensity([4], [max], 10)).toBe(10);
    expect(sessionIntensity([4], [], 10)).toBe(4);
  });
});

describe("explainActValue", () => {
  const semi = { id: "semi", name: "Semi-public", points: 1, groupId: "loc", isMax: false };
  const priv = { id: "priv", name: "Private", points: 0, groupId: "loc", isMax: false };
  const pub = { id: "pub", name: "Public", points: 2, groupId: "loc", isMax: false };
  const max = { id: "max", name: "Max", points: 0, groupId: null, isMax: true };
  it("sums the level and the extras that add points", () => {
    expect(explainActValue("Topless", 5, [semi, priv], 10)).toBe("Topless 5 + Semi-public 1 = 6");
    expect(explainActValue("Topless", 5, [], 10)).toBe("Topless 5");
  });
  it("says when the cap bites, and when Max decides", () => {
    expect(explainActValue("Spreads", 8.5, [pub], 10)).toBe("Spreads 8.5 + Public 2 = 10.5 → capped at 9.5");
    expect(explainActValue("Spreads", 8.5, [pub, max], 10)).toBe("Max → 10");
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

describe("another Max (2026-10-23)", () => {
  const pub = { id: "pub", name: "Public", points: 2, groupId: "loc", isMax: false };
  const max = { id: "max", points: 0, groupId: null, isMax: true };
  it("caps half a step below it, and Max sets it", () => {
    expect(actValue(10, [pub], 12)).toBe(11.5);
    expect(actValue(10, [pub], 8)).toBe(7.5);
    expect(actValue(1, [max], 12)).toBe(12);
    expect(sessionIntensity([3], [max], 12)).toBe(12);
    expect(explainActValue("Spreads", 10, [pub], 12)).toBe("Spreads 10 + Public 2 = 12 → capped at 11.5");
  });
  it("lays out its rows up to it", () => {
    expect(intensityRows([], [], false, 6)).toEqual([0, 1, 2, 3, 4, 5, 5.5, 6]);
    expect(intensityRows([], [], true, 12)).toHaveLength(25);
  });
  it("spreads the filter thresholds below it, then Max", () => {
    expect(intensityFilterOptions(10).map((o) => o.value)).toEqual(["0", "3", "5", "7", "9", "10"]);
    expect(intensityFilterOptions(12).map((o) => o.value)).toEqual(["0", "4", "6", "8", "11", "12"]);
    expect(withIntensityFilter("beach", "8", 12)).toBe("beach intensity>=8");
    expect(withIntensityFilter("beach", "9", 12)).toBe("beach"); // not an option at 12
  });
});

describe("intensityColor", () => {
  it("runs green → violet from 0 to Max, continuously", () => {
    expect(intensityColor(0, 10)).toBe("rgb(162, 214, 176)");
    expect(intensityColor(10, 10)).toBe("rgb(128, 96, 176)");
    expect(intensityColor(12, 12)).toBe("rgb(128, 96, 176)");
    // a half step sits between its neighbours
    const g = (v: number) => Number(/rgb\((\d+), (\d+)/.exec(intensityColor(v, 10))![2]);
    expect(g(5)).toBeGreaterThanOrEqual(g(5.5));
    expect(g(5.5)).toBeGreaterThanOrEqual(g(6));
    expect(intensityColor(15, 10)).toBe(intensityColor(10, 10)); // above Max: the top colour
  });
  it("picks dark text on the light end, white on the dark end", () => {
    expect(intensityTextColor(1, 10)).toBe("rgb(17, 24, 39)");
    expect(intensityTextColor(10, 10)).toBe("rgb(255, 255, 255)");
  });
});

describe("negative points (2026-10-23)", () => {
  const calm = { id: "calm", name: "Familiar", points: -1, groupId: null, isMax: false };
  const pub = { id: "pub", name: "Public", points: 2, groupId: "loc", isMax: false };
  const max = { id: "max", name: "Max", points: 0, groupId: null, isMax: true };
  it("take points off, never below 0; Max still sets Max", () => {
    expect(actValue(5, [calm], 10)).toBe(4);
    expect(actValue(5, [calm, pub], 10)).toBe(6);
    expect(actValue(0.5, [calm], 10)).toBe(0);
    expect(actValue(0.5, [calm, max], 10)).toBe(10);
  });
  it("show their sign in the explanation, and the floor", () => {
    expect(explainActValue("Topless", 5, [calm], 10)).toBe("Topless 5 − Familiar 1 = 4");
    expect(explainActValue("Topless", 5, [pub, calm], 10)).toBe("Topless 5 + Public 2 − Familiar 1 = 6");
    expect(explainActValue("Swimwear", 0.5, [calm], 10)).toBe("Swimwear 0.5 − Familiar 1 = -0.5 → at least 0");
  });
  it("are half steps, below zero too", () => {
    expect(isPointsStep(-1.5)).toBe(true);
    expect(isPointsStep(-1.3)).toBe(false);
    expect(isIntensityStep(-1)).toBe(false); // levels stay 0 or more
    expect(formatPoints(-1)).toBe("−1");
    expect(formatPoints(0.5)).toBe("+0.5");
    expect(formatPoints(0)).toBe("±0");
  });
});

describe("presets and review (2026-10-24)", () => {
  const groups: Record<string, string> = { semi: "where", pub: "where" };
  const groupOf = (id: string) => groups[id] ?? null;

  it("a preset adds the acts a person lacks and lays its extras over theirs", () => {
    const add = presetAdditions({ actIds: ["a"], extraIds: ["semi", "first"] }, { actIds: ["a", "b"], extraIds: ["pub"] }, groupOf);
    expect(add.actIds).toEqual(["b"]);
    // public replaces semi in its group; first time stays
    expect(add.extraIds.sort()).toEqual(["first", "pub"]);
  });

  it("a person is unrated, to review or done; a session done only when all are", () => {
    expect(intensityReview({ reviewed: false, acts: 0, extras: 0 })).toBe("unrated");
    expect(intensityReview({ reviewed: false, acts: 2, extras: 0 })).toBe("review");
    expect(intensityReview({ reviewed: false, acts: 0, extras: 1 })).toBe("review");
    expect(intensityReview({ reviewed: true, acts: 0, extras: 0 })).toBe("done"); // nothing to rate
    expect(sessionReview(["done", "done"])).toBe("done");
    expect(sessionReview(["done", "unrated"])).toBe("review");
    expect(sessionReview(["unrated", "unrated"])).toBe("unrated");
    expect(sessionReview([])).toBe("unrated");
  });
});

describe("presetValue", () => {
  const pub = { id: "pub", points: 1, groupId: null, isMax: false };
  const partner = { id: "partner", points: 2, groupId: null, isMax: false, offIn: ["solo"] };
  it("is the highest act with the extras counting in its scenario", () => {
    expect(presetValue([2, 5], [pub, partner], "solo", 10)).toBe(6);
    expect(presetValue([2, 5], [pub, partner], "gb", 10)).toBe(8);
  });
  it("is null without acts, Max with a Max extra", () => {
    expect(presetValue([], [pub], "solo", 10)).toBeNull();
    expect(presetValue([], [{ id: "m", points: 0, groupId: null, isMax: true }], "solo", 10)).toBe(10);
  });
});

describe("pickLastTime (2026-10-27)", () => {
  const d = (s: string) => new Date(s);
  const c = (id: string, date: string | null, channelId: string | null) => ({ id, date: date ? d(date) : null, channelId });
  const all = [c("a-2019", "2019-05-01", "A"), c("b-2023", "2023-01-01", "B"), c("a-2025", "2025-01-01", "A"), c("undated", null, "A")];
  it("prefers the same channel over a nearer session elsewhere", () => {
    expect(pickLastTime({ date: d("2024-06-01"), channelId: "A" }, all)?.id).toBe("a-2019");
  });
  it("takes the nearest earlier one in any channel when the channel has none", () => {
    expect(pickLastTime({ date: d("2024-06-01"), channelId: "C" }, all)?.id).toBe("b-2023");
    expect(pickLastTime({ date: d("2024-06-01"), channelId: null }, all)?.id).toBe("b-2023");
  });
  it("never looks ahead, never takes an undated one; an undated session takes the latest", () => {
    expect(pickLastTime({ date: d("2018-01-01"), channelId: "A" }, all)).toBeNull();
    expect(pickLastTime({ date: null, channelId: "A" }, all)?.id).toBe("a-2025");
    expect(pickLastTime({ date: d("2024-06-01"), channelId: "A" }, [c("undated", null, "A")])).toBeNull();
  });
  it("counts the same day as earlier", () => {
    expect(pickLastTime({ date: d("2023-01-01"), channelId: "B" }, all)?.id).toBe("b-2023");
  });
});

describe("usualPreset (2026-10-27)", () => {
  it("counts models, not ticks; ties go to catalog order", () => {
    const uses = [
      { presetId: "p2", contributionId: "x" },
      { presetId: "p2", contributionId: "x" },
      { presetId: "p1", contributionId: "y" },
    ];
    expect(usualPreset(uses, ["p1", "p2"])).toEqual({ presetId: "p1", models: 1 });
    expect(usualPreset([...uses, { presetId: "p2", contributionId: "z" }], ["p1", "p2"])).toEqual({ presetId: "p2", models: 2 });
    expect(usualPreset([], ["p1"])).toBeNull();
  });
});
