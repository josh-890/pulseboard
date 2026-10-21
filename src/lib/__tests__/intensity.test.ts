import { describe, it, expect } from "vitest";
import { actValue, effectiveExtras, formatIntensity, intensityRows, isIntensityStep, sessionIntensity } from "@/lib/intensity";

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
