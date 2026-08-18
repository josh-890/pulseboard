import { describe, expect, it } from "vitest";
import { archivePeopleMissingFromCast, castVerdict, type ArchivePerson } from "@/lib/archive-cast-gap";

// What the archive says about a set that the set does not say about itself.
//
// The rule decides what lights up in the staged-sets browser, so both wrong
// answers are expensive: fold in catalogue guesses and half the browser flags a
// disagreement nobody vouched for; count only confirmed claims and a marker you
// wrote by hand stays invisible until you happen to open the folder.

const claim = (icgId: string, name = icgId): ArchivePerson => ({ icgId, name, confirmed: true });
const marker = (icgId: string, name = icgId): ArchivePerson => ({ icgId, name, confirmed: false });

describe("archivePeopleMissingFromCast", () => {
  it("names who the cast leaves out", () => {
    const out = archivePeopleMissingFromCast(
      [claim("CX-00L3", "Katya Clover"), marker("GX-91LW", "Gina Gerson")],
      [{ icgId: "CX-00L3" }],
    );
    expect(out.map((p) => p.icgId)).toEqual(["GX-91LW"]);
    expect(out[0].confirmed).toBe(false);
  });

  it("is silent when the cast credits everyone", () => {
    expect(archivePeopleMissingFromCast([claim("CA-924J")], [{ icgId: "CA-924J" }])).toEqual([]);
  });

  it("flags everybody when the set credits nobody", () => {
    expect(archivePeopleMissingFromCast([marker("A-1"), claim("B-2")], []).map((p) => p.icgId))
      .toEqual(["A-1", "B-2"]);
  });

  // Claimed and marked is one person, and the claim is the stronger statement —
  // the panel says "confirmed" rather than "your marker".
  it("counts a person claimed and marked once, as confirmed", () => {
    const out = archivePeopleMissingFromCast([marker("A-1", "Ann"), claim("A-1", "Ann")], []);
    expect(out).toHaveLength(1);
    expect(out[0].confirmed).toBe(true);
  });

  it("keeps the confirmed reading whichever way round they arrive", () => {
    const out = archivePeopleMissingFromCast([claim("A-1"), marker("A-1")], []);
    expect(out[0].confirmed).toBe(true);
  });

  // A row whose ICG-ID never resolved cannot be compared with anything, and
  // showing it would put a nameless chip on the row for ever.
  it("ignores an entry with no ICG-ID", () => {
    expect(archivePeopleMissingFromCast([{ icgId: "", name: "Nobody", confirmed: true }], [])).toEqual([]);
  });
});

// The same rule one step earlier: shown on the suggestion banner, where a
// folder↔set match is confirmed. Until now that banner compared date and title
// while the operator held the person in their head — and 98 of 2,841 live
// proposals can be corroborated this way, one contradicted.
describe("castVerdict", () => {
  it("says nothing about a folder you have said nothing about", () => {
    expect(castVerdict([], ["CX-00L3"])).toEqual({ verdict: "unknown", missing: [] });
  });

  it("corroborates a match whose set credits your person", () => {
    expect(castVerdict([claim("CX-00L3", "Iveta C")], ["CX-00L3", "ZZ-1"])).toEqual({
      verdict: "agrees",
      missing: [],
    });
  });

  it("warns when the set does not credit somebody you recorded", () => {
    const res = castVerdict([marker("IA-91KP", "Irina Ann")], ["PL-0001"]);
    expect(res.verdict).toBe("missing");
    expect(res.missing.map((p) => p.name)).toEqual(["Irina Ann"]);
  });

  // A proposal to a set that credits nobody cannot corroborate anything.
  it("treats an empty cast as a disagreement, not as agreement", () => {
    expect(castVerdict([claim("CX-00L3")], []).verdict).toBe("missing");
  });
});
