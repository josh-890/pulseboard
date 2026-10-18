import { describe, expect, it } from "vitest";
import { findUndevelopedParticipants } from "@/lib/services/import/staging-cast-readiness";

// The Career-tab promote safelock: a participant is developed only when it
// resolves to an existing Person — by ICG-ID, or by the personId a manual add
// recorded on its status entry.

const persons = new Set(["p-known"]);
const icgs = new Set(["AA-01"]);

describe("findUndevelopedParticipants", () => {
  it("passes a cast that resolves entirely by ICG-ID", () => {
    expect(findUndevelopedParticipants([{ name: "A", icgId: "AA-01" }], [], persons, icgs)).toEqual([]);
  });

  it("passes a manually added person without an ICG-ID via the status personId", () => {
    expect(
      findUndevelopedParticipants(
        [{ name: "B", icgId: "" }],
        [{ name: "B", icgId: "", personId: "p-known" }],
        persons,
        icgs,
      ),
    ).toEqual([]);
  });

  it("flags an ICG-ID with no Person, a name-only participant and a stale personId", () => {
    expect(
      findUndevelopedParticipants(
        [
          { name: "New", icgId: "ZZ-99" },
          { name: "Nameless", icgId: "" },
          { name: "Gone", icgId: "" },
        ],
        [{ name: "Gone", icgId: "", personId: "p-deleted" }],
        persons,
        icgs,
      ),
    ).toEqual([
      { name: "New", icgId: "ZZ-99" },
      { name: "Nameless", icgId: "" },
      { name: "Gone", icgId: "" },
    ]);
  });

  it("treats a candidate status (name match, no personId) as not developed", () => {
    expect(
      findUndevelopedParticipants(
        [{ name: "Maybe", icgId: "ZZ-50" }],
        [{ name: "Maybe", icgId: "ZZ-50" }],
        persons,
        icgs,
      ),
    ).toEqual([{ name: "Maybe", icgId: "ZZ-50" }]);
  });
});
