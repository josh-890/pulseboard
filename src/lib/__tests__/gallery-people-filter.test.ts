import { describe, expect, it } from "vitest";
import {
  cycleChip,
  filterForCombination,
  isCombinationFilter,
  matchesPeopleFilter,
  peopleCombinations,
  shownPeople,
} from "@/lib/gallery-people-filter";

const CAST = ["A", "B", "C"];
const both = { sessionCastIds: ["A", "B"] };
const onlyA = { sessionCastIds: ["A", "B"], hiddenPersonIds: ["B"] };
const onlyB = { sessionCastIds: ["A", "B"], hiddenPersonIds: ["A"] };
const nobody = { sessionCastIds: ["A", "B"], hiddenPersonIds: ["A", "B"] };

describe("shownPeople", () => {
  it("is the session cast minus exclusions, in cast order", () => {
    expect(shownPeople({ sessionCastIds: ["B", "A"] }, CAST)).toEqual(["A", "B"]);
    expect(shownPeople(onlyA, CAST)).toEqual(["A"]);
  });

  it("ignores session cast the set does not credit", () => {
    expect(shownPeople({ sessionCastIds: ["A", "Z"] }, CAST)).toEqual(["A"]);
  });
});

describe("matchesPeopleFilter", () => {
  it("include is AND: every included person must be shown", () => {
    const f = { A: "include", B: "include" } as const;
    expect(matchesPeopleFilter(["A", "B"], f)).toBe(true);
    expect(matchesPeopleFilter(["A"], f)).toBe(false);
  });

  it("'A alone' excludes everybody else", () => {
    const f = filterForCombination(["A"], ["A", "B"]);
    expect(matchesPeopleFilter(["A"], f)).toBe(true);
    expect(matchesPeopleFilter(["A", "B"], f), "A with B is not A alone").toBe(false);
    expect(matchesPeopleFilter([], f)).toBe(false);
  });

  it("an empty filter lets everything through", () => {
    expect(matchesPeopleFilter([], {})).toBe(true);
  });
});

describe("cycleChip", () => {
  it("goes off → include → exclude → off", () => {
    const a = cycleChip({}, "A");
    expect(a).toEqual({ A: "include" });
    const b = cycleChip(a, "A");
    expect(b).toEqual({ A: "exclude" });
    expect(cycleChip(b, "A")).toEqual({});
  });
});

describe("peopleCombinations", () => {
  it("lists the combinations that occur: solos, then groups, nobody last", () => {
    const combos = peopleCombinations([both, onlyB, onlyA, both, nobody, onlyA], ["A", "B"]);
    expect(combos.map((c) => [c.personIds, c.count])).toEqual([
      [["A"], 2],
      [["B"], 1],
      [["A", "B"], 2],
      [[], 1],
    ]);
  });

  it("omits combinations nobody has", () => {
    expect(peopleCombinations([both, both], ["A", "B"]).map((c) => c.key)).toEqual(["A|B"]);
  });
});

describe("isCombinationFilter", () => {
  it("recognises the filter a combination set, and nothing looser", () => {
    const cast = ["A", "B"];
    expect(isCombinationFilter(filterForCombination(["A"], cast), ["A"], cast)).toBe(true);
    expect(isCombinationFilter({ A: "include" }, ["A"], cast)).toBe(false);
  });
});
