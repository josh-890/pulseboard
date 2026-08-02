import { describe, expect, it } from "vitest";
import {
  buildCatalogueIndex,
  channelLooselyMatches,
  distinctPersons,
  isAmbiguous,
  matchFolder,
  normalizeTitle,
  parseCoverFilename,
  parsePersonDir,
  tierFor,
  titleSimilarity,
  type ArchiveFolderRow,
  type CatalogueSet,
} from "@/lib/services/catalogue-join";

// Slice 0 exists to produce numbers a design decision rests on (ADR-0027), so the
// arithmetic behind those numbers is tested rather than trusted. Every fixture
// below is a real value observed in the production data or the 6-person sample.

function cat(over: Partial<CatalogueSet> & Pick<CatalogueSet, "date" | "title">): CatalogueSet {
  return {
    icgId: "NA-00YC",
    personName: "Nancy A",
    channel: "METART",
    externalId: "251663",
    isVideo: false,
    ...over,
  };
}

function folder(over: Partial<ArchiveFolderRow>): ArchiveFolderRow {
  return {
    archiveKey: "k",
    folderName: "2014-01-28-MA Nancy A - Presenting Nancy",
    parsedDate: "2014-01-28",
    parsedShortName: "MA",
    parsedTitle: "Presenting Nancy",
    ...over,
  };
}

describe("parseCoverFilename", () => {
  it("parses the plain shape", () => {
    expect(parseCoverFilename("2014-01-28-METART-251663-Presenting_Nancy.jpg")).toEqual({
      date: "2014-01-28",
      channel: "METART",
      externalId: "251663",
      title: "Presenting_Nancy",
    });
  });

  it("keeps a channel that contains a space or a dash", () => {
    // Real: SEXART VIDEO, X-ART. A greedy channel group would swallow the id.
    expect(parseCoverFilename("2019-09-25-SEXART VIDEO-820951-Holiday.jpg")?.channel).toBe("SEXART VIDEO");
    expect(parseCoverFilename("2017-01-28-X-ART-573464-A_Rose.jpg")?.channel).toBe("X-ART");
  });

  it("keeps a channel that contains digits", () => {
    const p = parseCoverFilename("0000-00-00-VIRTUAGIRL3K-404419-0397_-_Sultry_Lady.jpg");
    expect(p?.channel).toBe("VIRTUAGIRL3K");
    expect(p?.externalId).toBe("404419");
  });

  it("surfaces the unusable-date sentinel rather than inventing one", () => {
    expect(parseCoverFilename("0000-00-00-VG-1-X.jpg")?.date).toBe("0000-00-00");
  });

  it("rejects anything that is not a cover filename", () => {
    expect(parseCoverFilename("Bios.txt")).toBeNull();
    expect(parseCoverFilename("Nancy_A_(NA-00YC).jpg")).toBeNull();
  });
});

describe("parsePersonDir", () => {
  it("splits name and ICG-ID", () => {
    expect(parsePersonDir("Gina_Gerson_(GX-91LW)")).toEqual({ name: "Gina Gerson", icgId: "GX-91LW" });
  });

  it("accepts a self-assigned ICG-ID (ADR-0026 marker)", () => {
    expect(parsePersonDir("Ghost_(JD-95@K7R)")?.icgId).toBe("JD-95@K7R");
  });

  it("rejects a directory without an ICG-ID", () => {
    expect(parsePersonDir("_meta")).toBeNull();
  });
});

describe("normalizeTitle", () => {
  it("makes the catalogue's underscores and the archive's spaces comparable", () => {
    expect(normalizeTitle("Presenting_Nancy")).toBe(normalizeTitle("Presenting Nancy"));
  });

  it("folds diacritics and drops punctuation", () => {
    expect(normalizeTitle("Café — Déjà Vu!")).toBe("cafe deja vu");
  });
});

describe("titleSimilarity", () => {
  it("is 1 for equal titles and 0 for empty input", () => {
    expect(titleSimilarity("sky light", "sky light")).toBe(1);
    expect(titleSimilarity("", "")).toBe(0);
  });

  it("scores a near-miss high and an unrelated title low", () => {
    expect(titleSimilarity(normalizeTitle("Sky Light"), normalizeTitle("Skylight"))).toBeGreaterThan(0.75);
    expect(titleSimilarity(normalizeTitle("Presenting"), normalizeTitle("Poolside Fuck Date"))).toBeLessThan(0.5);
  });
});

describe("tierFor", () => {
  it("bands the score", () => {
    expect(tierFor(1)).toBe("exact");
    expect(tierFor(0.8)).toBe("strong");
    expect(tierFor(0.6)).toBe("weak");
    expect(tierFor(0.2)).toBe("none");
  });
});

describe("matchFolder", () => {
  const index = buildCatalogueIndex([
    cat({ date: "2014-01-28", title: "Presenting_Nancy" }),
    cat({ date: "2020-08-08", title: "Sky_Light", channel: "FEMJOY", icgId: "CM-009N" }),
    cat({ date: "2020-08-08", title: "Sky_Light", channel: "MPL STUDIOS", icgId: "CM-009N" }),
  ]);

  it("matches on exact date plus exact title", () => {
    const m = matchFolder(folder({}), index);
    expect(m.tier).toBe("exact");
    expect(m.best?.title).toBe("Presenting_Nancy");
  });

  it("does not match the same title on a different date", () => {
    // The date is what makes generic titles usable: "Presenting" occurs 757
    // times in the archive but collides on a date in under 1% of its keys.
    expect(matchFolder(folder({ parsedDate: "2015-01-28" }), index).tier).toBe("none");
  });

  it("ignores the channel when choosing a match", () => {
    // A set filed under a different channel than it was published under must
    // still match — that is the whole reason channel is not part of the key.
    const m = matchFolder(folder({ parsedShortName: "SOMETHING-ELSE" }), index);
    expect(m.tier).toBe("exact");
  });

  it("uses the channel to break a tie", () => {
    const m = matchFolder(
      folder({ parsedDate: "2020-08-08", parsedTitle: "Sky Light", parsedShortName: "FJ" }),
      index,
    );
    expect(m.candidates).toHaveLength(2);
    expect(m.best?.channel).toBe("FEMJOY");
  });

  it("reports an unresolved tie instead of guessing", () => {
    const m = matchFolder(
      folder({ parsedDate: "2020-08-08", parsedTitle: "Sky Light", parsedShortName: "ZZZ" }),
      index,
    );
    expect(m.candidates).toHaveLength(2);
  });

  it("does not call the same person listed twice ambiguous", () => {
    // Real shape from the catalogue: one set appears as both a photoset and a
    // video, and sometimes under two spellings of its channel. Two rows, one
    // person, no decision to make.
    const dupes = buildCatalogueIndex([
      cat({ date: "2017-01-20", title: "Hitchhikers", channel: "SEXART VIDEO", icgId: "NA-00YC" }),
      cat({ date: "2017-01-20", title: "Hitchhikers", channel: "SEXART", icgId: "NA-00YC", isVideo: true }),
    ]);
    const m = matchFolder(
      folder({ parsedDate: "2017-01-20", parsedTitle: "Hitchhikers", parsedShortName: "SA" }),
      dupes,
    );
    expect(m.candidates).toHaveLength(2);
    expect(distinctPersons(m)).toBe(1);
    expect(isAmbiguous(m)).toBe(false);
  });

  it("does call two different people ambiguous", () => {
    const conflict = buildCatalogueIndex([
      cat({ date: "2023-05-17", title: "Presenting", icgId: "AA-0001" }),
      cat({ date: "2023-05-17", title: "Presenting", icgId: "BB-0002" }),
    ]);
    const m = matchFolder(
      folder({ parsedDate: "2023-05-17", parsedTitle: "Presenting", parsedShortName: "MA" }),
      conflict,
    );
    expect(distinctPersons(m)).toBe(2);
    expect(isAmbiguous(m)).toBe(true);
  });

  it("returns nothing when the folder has no date", () => {
    expect(matchFolder(folder({ parsedDate: null }), index).tier).toBe("none");
  });

  it("never indexes catalogue rows with the unusable-date sentinel", () => {
    const idx = buildCatalogueIndex([cat({ date: "0000-00-00", title: "X" })]);
    expect(idx.size).toBe(0);
  });
});

describe("channelLooselyMatches", () => {
  it("accepts the abbreviated form — a subsequence, not initials", () => {
    // Every one of these is a real pairing from the data. None is derivable by
    // taking word initials, which is why the test is a subsequence check.
    expect(channelLooselyMatches("WATCH4BEAUTY", "W4B")).toBe(true);
    expect(channelLooselyMatches("MPL STUDIOS", "MPL")).toBe(true);
    expect(channelLooselyMatches("FEMJOY", "FJ")).toBe(true);
    expect(channelLooselyMatches("LETSDOEIT", "LDI")).toBe(true);
    expect(channelLooselyMatches("AMOUR ANGELS", "AA")).toBe(true);
    expect(channelLooselyMatches("METART", "MA")).toBe(true);
  });

  it("accepts a punctuation-only difference", () => {
    expect(channelLooselyMatches("AMOUR ANGELS", "amourangels")).toBe(true);
    expect(channelLooselyMatches("1BY-DAY", "1byday")).toBe(true);
  });

  it("rejects unrelated channels", () => {
    expect(channelLooselyMatches("FEMJOY", "MPL")).toBe(false);
    expect(channelLooselyMatches("HEGRE-ART", "W4B")).toBe(false);
    expect(channelLooselyMatches("", "FJ")).toBe(false);
  });
});
