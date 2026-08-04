import { describe, expect, it } from "vitest";
import {
  parseFolderParticipant,
  parseFolderParticipantRaw,
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

describe("parseFolderParticipantRaw", () => {
  it("returns the raw (un-normalized) person segment for prefill", () => {
    expect(parseFolderParticipantRaw("2005-08-28-MA Anna Y - Bonjour")).toBe("Anna Y");
    expect(parseFolderParticipantRaw("2006-01-16-BIM Anna-Leah — Serious Red")).toBe("Anna-Leah");
  });

  it("preserves original casing (unlike the normalized parser)", () => {
    const folder = "2005-10-24-BIM Corinna - These boots are made for gawkin'";
    expect(parseFolderParticipantRaw(folder)).toBe("Corinna");
    expect(parseFolderParticipant(folder)).toBe("corinna");
  });

  it("returns null for non-canonical names", () => {
    expect(parseFolderParticipantRaw("random folder")).toBeNull();
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
  // Every suggestion must agree in at least one hard field. Measured on 2,733 live
  // suggestions under the old rule: 14% agreed on neither date nor title.
  it("a name match alone is NOT evidence", () => {
    expect(scoreArchiveMatch({ titleSim: 0.0, nameMatch: true, isExactDay: false })).toBeNull();
  });

  it("name match on the exact day → HIGH", () => {
    expect(scoreArchiveMatch({ titleSim: 0.0, nameMatch: true, isExactDay: true })).toBe("HIGH");
  });

  it("strong title carries a suggestion on its own, even off-day (archive dates are hand-typed)", () => {
    expect(scoreArchiveMatch({ titleSim: HIGH_TITLE_THRESHOLD, nameMatch: false, isExactDay: false })).toBe("HIGH");
  });

  it("exact day with a weak title → MEDIUM, not nothing", () => {
    expect(scoreArchiveMatch({ titleSim: 0.1, nameMatch: false, isExactDay: true })).toBe("MEDIUM");
  });

  // The rule that removes the noise: "Presenting" occurs 757 times in the archive,
  // so a mid trigram score inside a channel+year window means nothing without a date.
  it("mid title without the exact day → no suggestion", () => {
    expect(scoreArchiveMatch({ titleSim: MEDIUM_TITLE_THRESHOLD, nameMatch: false, isExactDay: false })).toBeNull();
  });

  it("neither day nor title → no suggestion", () => {
    expect(scoreArchiveMatch({ titleSim: 0.1, nameMatch: false, isExactDay: false })).toBeNull();
  });
});

describe("pickBestArchiveCandidate", () => {
  it("returns null when no candidate clears the gate", () => {
    // Nothing agrees on a hard field: the day is wrong and the titles are weak.
    expect(
      pickBestArchiveCandidate([
        { id: "a", titleSim: 0.1, nameMatch: false, isExactDay: false },
        { id: "b", titleSim: 0.2, nameMatch: true, isExactDay: false },
      ]),
    ).toBeNull();
  });

  it("an exact day is itself agreement, so a weak title on the right day still qualifies", () => {
    expect(
      pickBestArchiveCandidate([{ id: "a", titleSim: 0.1, nameMatch: false, isExactDay: true }]),
    ).toEqual({ id: "a", confidence: "MEDIUM" });
  });

  it("an off-day name match no longer beats an exact-day candidate — it no longer qualifies at all", () => {
    const best = pickBestArchiveCandidate([
      { id: "exactDayMedium", titleSim: 0.45, nameMatch: false, isExactDay: true },
      { id: "offDayNameMatch", titleSim: 0.1, nameMatch: true, isExactDay: false },
    ]);
    expect(best).toEqual({ id: "exactDayMedium", confidence: "MEDIUM" });
  });

  it("on the same day, the name match promotes one candidate over a weak-title sibling", () => {
    const best = pickBestArchiveCandidate([
      { id: "weak", titleSim: 0.45, nameMatch: false, isExactDay: true },
      { id: "named", titleSim: 0.2, nameMatch: true, isExactDay: true },
    ]);
    expect(best).toEqual({ id: "named", confidence: "HIGH" });
  });

  it("within the same confidence, prefers exact-day, then higher title similarity", () => {
    const best = pickBestArchiveCandidate([
      { id: "yearHighSim", titleSim: 0.9, nameMatch: false, isExactDay: false },
      { id: "exactDay", titleSim: 0.65, nameMatch: false, isExactDay: true },
    ]);
    expect(best).toEqual({ id: "exactDay", confidence: "HIGH" });
  });
});
