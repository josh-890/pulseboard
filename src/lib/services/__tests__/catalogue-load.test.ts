import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  duplicateFolderIcgIds,
  extractFolder,
  mergeCatalogueSet,
  setDate,
  type CatalogueSetRow,
} from "@/lib/services/catalogue-load";
import type { FolderInput } from "@/lib/services/catalogue-inventory";

// ADR-0038 S3: what the load keeps from one folder, and how one set is merged
// across every file that lists it. Base file: the real catalogue file in docs/.
const ANNA = readFileSync(path.join(process.cwd(), "docs", "2026-02-22_Anna_Y_(AY-006S)"), "utf8");
const ANNA_FILE = "2026-02-22_Anna_Y_(AY-006S)";

function folder(over: Partial<FolderInput> = {}): FolderInput {
  return {
    path: "A\\Anna_Y_(AY-006S)",
    dirName: "Anna_Y_(AY-006S)",
    importFiles: [{ name: ANNA_FILE, content: ANNA }],
    metaImages: [{ name: "Anna_Y_(AY-006S).jpg", size: 20_000 }],
    personImages: [],
    covers: 0,
    coverChecks: [],
    ...over,
  };
}

const row = (over: Partial<CatalogueSetRow> = {}): CatalogueSetRow => ({
  coverId: "1",
  date: "2020-01-02",
  altDates: [],
  channelName: "METART",
  title: "Morning",
  isVideo: false,
  castIcgIds: ["AY-006S"],
  disagreements: null,
  sourceDate: "2026-01-01",
  ...over,
});

describe("one folder", () => {
  it("keeps her identity, lookup aids, aliases per channel and sets with the cast", () => {
    const ex = extractFolder(folder());
    expect(ex.quarantined).toBe(false);
    expect(ex.identity).toMatchObject({ icgId: "AY-006S", name: "Anna Y", catalogueDate: "2026-02-22" });
    expect(ex.aliases).toEqual([{ channelName: "METART", alias: "Anna Y" }]);
    expect(ex.sets).toHaveLength(1);
    expect(ex.sets[0]).toMatchObject({ coverId: "13850", channelName: "METART", sourceDate: "2026-02-22" });
    expect(ex.sets[0].castIcgIds).toContain("AY-006S");
    expect(ex.newestFile?.name).toBe(ANNA_FILE);
  });

  it("a quarantined folder keeps no identity, only why", () => {
    const ex = extractFolder(folder({ dirName: "Anna_Y_(AY-006X)" }));
    expect(ex.quarantined).toBe(true);
    expect(ex.identity).toBeNull();
    expect(ex.record.problems.map((p) => p.code)).toEqual(["Q4"]);
  });

  it("an ICG-ID in two folders is quarantined (Q5)", () => {
    expect(duplicateFolderIcgIds([
      { path: "a", dirIcgId: "JA-86IQ" },
      { path: "b", dirIcgId: "JA-86IQ" },
      { path: "c", dirIcgId: "AY-006S" },
    ])).toEqual(new Set(["JA-86IQ"]));
    const ex = extractFolder(folder(), { duplicate: true });
    expect(ex.quarantined).toBe(true);
    expect(ex.record.problems[0].code).toBe("Q5");
  });

  it("the newest file wins; an older one fills gaps and its different date is kept", () => {
    const older = ANNA.replace("Date        : 2005-08-28", "Date        : 2005-08-29");
    const ex = extractFolder(folder({
      importFiles: [
        { name: ANNA_FILE, content: ANNA },
        { name: "2025-01-01_Anna_Y_(AY-006S)", content: older },
      ],
    }));
    expect(ex.sets).toHaveLength(1);
    expect(ex.sets[0].sourceDate).toBe("2026-02-22");
    expect(older).not.toBe(ANNA);
    expect(ex.sets[0].altDates).toEqual(["2005-08-29"]);
  });
});

describe("one set across files", () => {
  it("cast is the union; the newest file wins title, date and channel; differences are kept", () => {
    const merged = mergeCatalogueSet(
      row({ castIcgIds: ["AY-006S"], sourceDate: "2025-01-01", title: "Morning", date: "2020-01-02" }),
      row({ castIcgIds: ["SB-00UP"], sourceDate: "2026-01-01", title: "Morning Light", date: "2020-01-03" }),
    );
    expect(merged.castIcgIds.sort()).toEqual(["AY-006S", "SB-00UP"]);
    expect(merged).toMatchObject({ title: "Morning Light", date: "2020-01-03", sourceDate: "2026-01-01" });
    expect(merged.altDates).toEqual(["2020-01-02"]);
    expect(merged.disagreements).toEqual({ title: ["Morning Light", "Morning"] });
  });

  it("an older file does not override the newer one", () => {
    const merged = mergeCatalogueSet(row({ sourceDate: "2026-01-01", channelName: "METART" }), row({ sourceDate: "2024-01-01", channelName: "MET ART" }));
    expect(merged.channelName).toBe("METART");
    expect(merged.disagreements).toEqual({ channel: ["METART", "MET ART"] });
  });

  it("agreeing files record nothing", () => {
    expect(mergeCatalogueSet(row(), row()).disagreements).toBeNull();
  });
});

describe("dates", () => {
  it("0000-00-00 and impossible days are no date", () => {
    expect(setDate("2005-08-28")).toBe("2005-08-28");
    expect(setDate("0000-00-00")).toBeNull();
    expect(setDate("2005-02-30")).toBeNull();
    expect(setDate(null)).toBeNull();
  });
});
