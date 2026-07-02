import { describe, expect, it } from "vitest";
import { computeShownIds } from "@/lib/services/appearance-service";

describe("computeShownIds (per-image appearance, ADR-0023)", () => {
  const cast = ["a", "b", "c"];

  it("shows the whole cast when nothing is hidden", () => {
    expect(computeShownIds(cast, [])).toEqual(["a", "b", "c"]);
  });

  it("subtracts hidden people, preserving cast order", () => {
    expect(computeShownIds(cast, ["b"])).toEqual(["a", "c"]);
    expect(computeShownIds(cast, new Set(["a", "c"]))).toEqual(["b"]);
  });

  it("ignores hidden ids that are not in the cast (stale exclusions are inert)", () => {
    // 'x' was hidden but is no longer part of the cast → no effect.
    expect(computeShownIds(cast, ["x", "b"])).toEqual(["a", "c"]);
  });

  it("default follows the live cast: adding a member shows them without touching exclusions", () => {
    const hidden = ["b"]; // exclusion set is unchanged
    const before = computeShownIds(["a", "b", "c"], hidden);
    const after = computeShownIds(["a", "b", "c", "d"], hidden); // 'd' newly credited
    expect(before).toEqual(["a", "c"]);
    expect(after).toEqual(["a", "c", "d"]);
  });

  it("hiding the entire cast yields an empty shown set", () => {
    expect(computeShownIds(cast, cast)).toEqual([]);
  });
});
