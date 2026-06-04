import { describe, expect, it } from "vitest";
import {
  parseFolderParticipant,
  folderPersonMatches,
  scoreArchiveMatch,
  pickBestArchiveCandidate,
  HIGH_TITLE_THRESHOLD,
  MEDIUM_TITLE_THRESHOLD,
} from "@/lib/services/archive-service";

describe("parseFolderParticipant", () => {
  it("extracts and normalizes the person from a canonical folder name", () => {
    expect(parseFolderParticipant("2005-08-28-MA Anna Y - Bonjour")).toBe("anna y");
  });

  it("handles en/em-dash separators and multi-word titles", () => {
    expect(parseFolderParticipant("2006-01-16-BIM Anna-Leah — Serious Red")).toBe("anna-leah");
    expect(parseFolderParticipant("2005-10-24-BIM Corinna - These boots are made for gawkin'")).toBe("corinna");
  });

  it("returns null for non-canonical names (no ' - ' person/title separator)", () => {
    expect(parseFolderParticipant("2005-08-28-MA Bonjour")).toBeNull();
    expect(parseFolderParticipant("random folder")).toBeNull();
  });
});

describe("folderPersonMatches", () => {
  it("matches on exact normalized equality", () => {
    expect(folderPersonMatches("anna y", ["anna y", "bella"])).toBe(true);
  });

  it("matches a multi-token folder person against a single-token alias (alias ⊂ folder)", () => {
    expect(folderPersonMatches("anna y", ["anna"])).toBe(true);
  });

  it("matches when folder tokens are a subset of an alias's tokens", () => {
    expect(folderPersonMatches("anna", ["anna y"])).toBe(true);
  });

  it("tolerates punctuation differences via tokenization", () => {
    expect(folderPersonMatches("anna-leah", ["anna leah"])).toBe(true);
  });

  it("does not match a different person", () => {
    expect(folderPersonMatches("anna y", ["corinna", "bella x"])).toBe(false);
  });

  it("returns false when the folder person is null/empty or no names are known", () => {
    expect(folderPersonMatches(null, ["anna"])).toBe(false);
    expect(folderPersonMatches("anna", [])).toBe(false);
  });
});

describe("scoreArchiveMatch", () => {
  it("name match → HIGH regardless of title similarity (caveat b: alias may be unknown / title drift)", () => {
    expect(scoreArchiveMatch({ titleSim: 0.0, nameMatch: true })).toBe("HIGH");
  });

  it("no name match but strong title → HIGH", () => {
    expect(scoreArchiveMatch({ titleSim: HIGH_TITLE_THRESHOLD, nameMatch: false })).toBe("HIGH");
  });

  it("no name match, mid title → MEDIUM", () => {
    expect(scoreArchiveMatch({ titleSim: MEDIUM_TITLE_THRESHOLD, nameMatch: false })).toBe("MEDIUM");
  });

  it("no name match, weak title → no suggestion (kills same date+channel false positives)", () => {
    expect(scoreArchiveMatch({ titleSim: 0.1, nameMatch: false })).toBeNull();
  });
});

describe("pickBestArchiveCandidate", () => {
  it("returns null when no candidate clears the gate", () => {
    expect(
      pickBestArchiveCandidate([
        { id: "a", titleSim: 0.1, nameMatch: false, isExactDay: true },
        { id: "b", titleSim: 0.2, nameMatch: false, isExactDay: true },
      ]),
    ).toBeNull();
  });

  it("prefers a name-match (HIGH) over an exact-day title-only MEDIUM", () => {
    const best = pickBestArchiveCandidate([
      { id: "exactDayMedium", titleSim: 0.45, nameMatch: false, isExactDay: true },
      { id: "nameMatch", titleSim: 0.1, nameMatch: true, isExactDay: false },
    ]);
    expect(best).toEqual({ id: "nameMatch", confidence: "HIGH" });
  });

  it("within the same confidence, prefers exact-day, then higher title similarity", () => {
    const best = pickBestArchiveCandidate([
      { id: "yearHighSim", titleSim: 0.9, nameMatch: false, isExactDay: false },
      { id: "exactDay", titleSim: 0.65, nameMatch: false, isExactDay: true },
    ]);
    expect(best).toEqual({ id: "exactDay", confidence: "HIGH" });
  });
});
