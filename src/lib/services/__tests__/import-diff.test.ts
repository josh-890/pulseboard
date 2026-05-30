import { describe, expect, it } from "vitest";
import {
  computeImportDiff,
  allDecisionsMade,
  isEmptyDiff,
  normaliseAliasKey,
  type MatchedPersonSnapshot,
  type ImportPayload,
} from "@/lib/services/import/diff";

function emptyMatched(over: Partial<MatchedPersonSnapshot> = {}): MatchedPersonSnapshot {
  return {
    birthdate: null,
    birthdatePrecision: null,
    nationality: null,
    activeFrom: null,
    retiredAt: null,
    bio: null,
    sexAtBirth: null,
    birthPlace: null,
    aliases: [],
    baselineScalars: new Map(),
    ...over,
  };
}

function emptyPayload(over: Partial<ImportPayload> = {}): ImportPayload {
  return { scalars: {}, ...over };
}

describe("computeImportDiff — scalars", () => {
  it("skips identical scalar values", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" } }),
      emptyMatched({
        baselineScalars: new Map([["hair_color", { value: "Brown", isVerifiedUnknown: false }]]),
      }),
    );
    expect(diff.scalars).toHaveLength(0);
  });

  it("surfaces fill-gap with baseline as default destination", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" } }),
      emptyMatched(),
    );
    expect(diff.scalars).toHaveLength(1);
    expect(diff.scalars[0].defaultDestination).toBe("baseline");
    expect(diff.scalars[0].decision).toBeNull();
  });

  it("surfaces conflict with on-date as default destination", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" } }),
      emptyMatched({
        baselineScalars: new Map([["hair_color", { value: "Blonde", isVerifiedUnknown: false }]]),
      }),
    );
    expect(diff.scalars).toHaveLength(1);
    expect(diff.scalars[0].dbValue).toBe("Blonde");
    expect(diff.scalars[0].defaultDestination).toBe("on-date");
  });

  it("surfaces verified-unknown collision with on-date default", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" } }),
      emptyMatched({
        baselineScalars: new Map([["hair_color", { value: "", isVerifiedUnknown: true }]]),
      }),
    );
    expect(diff.scalars).toHaveLength(1);
    expect(diff.scalars[0].dbIsVerifiedUnknown).toBe(true);
    expect(diff.scalars[0].defaultDestination).toBe("on-date");
  });

  it("skips empty import values", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "", weight: "  " } }),
      emptyMatched(),
    );
    expect(diff.scalars).toHaveLength(0);
  });
});

describe("computeImportDiff — aliases", () => {
  it("surfaces a new common alias", () => {
    const diff = computeImportDiff(
      emptyPayload({ commonName: "Nancy A" }),
      emptyMatched(),
    );
    expect(diff.aliases).toHaveLength(1);
    expect(diff.aliases[0]).toMatchObject({ kind: "common", importLabel: "Nancy A" });
  });

  it("skips an alias that already exists (case-insensitive)", () => {
    const diff = computeImportDiff(
      emptyPayload({ commonName: "Nancy A" }),
      emptyMatched({ aliases: [{ name: "nancy a", isCommon: true, isBirth: false }] }),
    );
    expect(diff.aliases).toHaveLength(0);
  });

  it("surfaces birth alias separately from common", () => {
    const diff = computeImportDiff(
      emptyPayload({ birthName: "Anastasiya Shubeyko" }),
      emptyMatched({ aliases: [{ name: "Nancy A", isCommon: true, isBirth: false }] }),
    );
    expect(diff.aliases).toHaveLength(1);
    expect(diff.aliases[0].kind).toBe("birth");
  });
});

describe("computeImportDiff — Person columns", () => {
  it("surfaces nationality conflict", () => {
    const diff = computeImportDiff(
      emptyPayload({ nationality: "DE" }),
      emptyMatched({ nationality: "UA" }),
    );
    expect(diff.personColumns).toHaveLength(1);
    expect(diff.personColumns[0]).toMatchObject({
      field: "nationality",
      dbValue: "UA",
      importValue: "DE",
    });
  });

  it("surfaces fill-gap for birthdate", () => {
    const diff = computeImportDiff(
      emptyPayload({ birthdateIso: "1994-11-17" }),
      emptyMatched(),
    );
    expect(diff.personColumns).toHaveLength(1);
    expect(diff.personColumns[0]).toMatchObject({ field: "birthdate", dbValue: null });
  });

  it("skips identical birthdate", () => {
    const diff = computeImportDiff(
      emptyPayload({ birthdateIso: "1994-11-17" }),
      emptyMatched({ birthdate: new Date("1994-11-17") }),
    );
    expect(diff.personColumns).toHaveLength(0);
  });
});

describe("allDecisionsMade", () => {
  it("returns true for empty diff", () => {
    expect(allDecisionsMade({ scalars: [], aliases: [], personColumns: [] })).toBe(true);
  });

  it("returns false when a scalar is undecided", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" } }),
      emptyMatched(),
    );
    expect(allDecisionsMade(diff)).toBe(false);
  });

  it("returns false when scalar accepted but no destination chosen", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" } }),
      emptyMatched(),
    );
    diff.scalars[0].decision = "accept";
    expect(allDecisionsMade(diff)).toBe(false);
  });

  it("returns true when every row is resolved", () => {
    const diff = computeImportDiff(
      emptyPayload({ scalars: { hair_color: "Brown" }, commonName: "Jane" }),
      emptyMatched(),
    );
    diff.scalars[0].decision = "accept";
    diff.scalars[0].chosenDestination = "baseline";
    diff.aliases[0].decision = "decline";
    expect(allDecisionsMade(diff)).toBe(true);
  });
});

describe("isEmptyDiff", () => {
  it("is true when no rows exist", () => {
    expect(isEmptyDiff({ scalars: [], aliases: [], personColumns: [] })).toBe(true);
  });
  it("is false when at least one row exists", () => {
    const diff = computeImportDiff(
      emptyPayload({ commonName: "Jane" }),
      emptyMatched(),
    );
    expect(isEmptyDiff(diff)).toBe(false);
  });
});

describe("normaliseAliasKey", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normaliseAliasKey("  Nancy   A  ")).toBe("nancy a");
  });
});
