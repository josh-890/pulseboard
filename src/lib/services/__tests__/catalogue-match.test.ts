import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addName,
  aliasTokens,
  evidenceTier,
  matchArchiveToCatalogue,
  matchFolderByEvidence,
  MATCH_SETTING,
  mergeScopes,
  toCandidates,
  type Candidate,
  type ChannelMaps,
  type NameIndex,
} from "@/lib/services/catalogue-match-service";

// ADR-0038 S5: archive folders matched against the catalogue set table on the
// evidence ladder — date required, then channel (import alias only), alias and
// title. The DB test runs on DEV with throwaway rows (MTCH-TEST / ZZ-95@ / ZMT…).

describe("the evidence ladder", () => {
  const s = (over: Partial<Parameters<typeof evidenceTier>[0]>) => ({
    channel: false, alias: false, title: 0, onlyOnChannel: false, ...over,
  });
  it("channel + alias is very strong even when the titles differ; channel + exact title too", () => {
    expect(evidenceTier(s({ channel: true, alias: true }))).toBe("EXACT");
    expect(evidenceTier(s({ channel: true, title: 1 }))).toBe("EXACT");
  });
  it("two of channel · alias · title ≥ .75 is strong", () => {
    expect(evidenceTier(s({ channel: true, title: 0.8 }))).toBe("STRONG");
    expect(evidenceTier(s({ alias: true, title: 0.8 }))).toBe("STRONG");
  });
  it("one piece of evidence is weak; channel alone only when it is the only set on it that day", () => {
    expect(evidenceTier(s({ alias: true }))).toBe("WEAK");
    expect(evidenceTier(s({ title: 1 }))).toBe("WEAK");
    expect(evidenceTier(s({ title: 0.5 }))).toBe("WEAK");
    expect(evidenceTier(s({ channel: true, onlyOnChannel: true }))).toBe("WEAK");
    expect(evidenceTier(s({ channel: true }))).toBeNull();
    expect(evidenceTier(s({ title: 0.4 }))).toBeNull();
  });
});

describe("one folder", () => {
  const chan = { id: "c1", labelId: "l1" };
  const other = { id: "c2", labelId: "l2" };
  const channels: ChannelMaps = {
    byAlias: new Map([["MPL STUDIOS", chan], ["HEGRE", other]]),
    byShort: new Map([["MPL", chan]]),
  };
  const names: NameIndex = new Map();
  addName(names, "Sybil A", "SA-00UW", null);
  addName(names, "Kailena", "SA-00UW", "MPL STUDIOS");
  addName(names, "Nancy A", "NA-00YC", null);
  const cand = (over: Partial<Candidate>): Candidate => ({
    coverId: "1", date: "2015-03-04", viaAltDate: false, channelName: "MPL STUDIOS", title: "Morning", cast: ["SA-00UW"], ...over,
  });
  const folder = (name: string, title: string) => ({ folderName: `2015-03-04-MPL ${name} - ${title}`, parsedShortName: "MPL", parsedTitle: title });

  it("her channel alias on that channel + the channel make it exact though the title differs", () => {
    const m = matchFolderByEvidence(folder("Kailena", "Sunrise"), [cand({})], channels, names)!;
    expect(m).toMatchObject({ tier: "EXACT", aliasPick: "SA-00UW", demotions: [] });
  });

  it("a channel alias counts only on its channel", () => {
    const m = matchFolderByEvidence(folder("Kailena", "Sunrise"), [cand({ channelName: "HEGRE" })], channels, names);
    expect(m).toBeNull();
  });

  it("a name's leading words find her ('Sybil' → Sybil A); several people in the name are each looked up", () => {
    expect(aliasTokens("Michelle & Rebecca")).toEqual(["michelle", "rebecca"]);
    const m = matchFolderByEvidence(folder("Sybil", "Sunrise"), [cand({})], channels, names)!;
    expect(m.tier).toBe("EXACT");
  });

  it("an exact title on an unlinked channel is weak and says the channel is unknown", () => {
    const m = matchFolderByEvidence(folder("Nobody", "Garden"), [cand({ channelName: "UNLINKED", title: "Garden" })], channels, names)!;
    expect(m).toMatchObject({ tier: "WEAK", demotions: ["UNKNOWN_CHANNEL"] });
  });

  it("the catalogue's channel on another label is CROSS_LABEL", () => {
    const m = matchFolderByEvidence(folder("Sybil", "Garden"), [cand({ channelName: "HEGRE", title: "Garden" })], channels, names)!;
    expect(m.tier).toBe("STRONG");
    expect(m.demotions).toEqual(["CROSS_LABEL"]);
  });

  it("channel alone against an exact title elsewhere is a tie with two casts — shown as ambiguous, not decided", () => {
    const m = matchFolderByEvidence(
      folder("Nobody", "Garden"),
      [cand({ coverId: "1", title: "Morning" }), cand({ coverId: "2", channelName: "UNLINKED", title: "Garden", cast: ["NA-00YC"] })],
      channels,
      names,
    )!;
    expect(m.ambiguous).toBe(true);
    expect(m.demotions).toContain("AMBIGUOUS");
  });

  it("a set matched through another date a file gave it is a DATE_VARIANT", () => {
    const [alt] = toCandidates(
      { coverId: "9", date: "2015-03-05", altDates: ["2015-03-04"], channelName: "MPL STUDIOS", title: "Morning", castIcgIds: ["SA-00UW"] },
      new Set(["2015-03-04"]),
    );
    expect(alt.viaAltDate).toBe(true);
    const m = matchFolderByEvidence(folder("Kailena", "Morning"), [alt], channels, names)!;
    expect(m.demotions).toEqual(["DATE_VARIANT"]);
  });

  it("requests waiting on one pass merge: all wins, the earlier scan wins", () => {
    const a = new Date("2026-01-01"), b = new Date("2026-02-01");
    expect(mergeScopes({ kind: "discoveredSince", since: b }, { kind: "discoveredSince", since: a })).toEqual({ kind: "discoveredSince", since: a });
    expect(mergeScopes({ kind: "folders", ids: ["x"] }, { kind: "all" })).toEqual({ kind: "all" });
  });
});

// ── End to end on the dev database ────────────────────────────────────────────

const P = "MTCH-TEST";
let matchBefore: string | null = null;
beforeEach(async () => {
  matchBefore = (await prisma.setting.findUnique({ where: { key: MATCH_SETTING } }))?.value ?? null;
});
afterEach(async () => {
  if (matchBefore) await prisma.setting.update({ where: { key: MATCH_SETTING }, data: { value: matchBefore } });
  else await prisma.setting.deleteMany({ where: { key: MATCH_SETTING } });
  await prisma.archiveFolder.deleteMany({ where: { folderName: { contains: P } } });
  await prisma.catalogueSet.deleteMany({ where: { coverId: { startsWith: P } } });
  await prisma.contact.deleteMany({ where: { icgId: { startsWith: "ZZ-95@" } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.label.deleteMany({ where: { name: { startsWith: P } } });
});

describe("a matching pass", () => {
  it("suggests the cast, replaces only its own stale suggestions and leaves other sources alone", async () => {
    const label = await prisma.label.create({ data: { name: `${P} Label` } });
    await prisma.channel.create({
      data: { name: `${P} Chan`, shortName: "ZMTX", importAliases: [`${P} CHAN`], labelId: label.id },
    });
    await prisma.contact.create({
      data: {
        icgId: "ZZ-95@AAA",
        name: "Alma Mtch",
        catalogueName: "Alma Mtch",
        channelAliases: { create: [{ channelName: `${P} CHAN`, alias: "Almira Q", aliasNorm: "almira q" }] },
      },
    });
    await prisma.catalogueSet.create({
      data: { coverId: `${P}-1`, date: new Date("2015-03-04"), channelName: `${P} CHAN`, title: "Morning Light", castIcgIds: ["ZZ-95@AAA"] },
    });
    const folder = (name: string, title: string, short = "ZMTX") =>
      prisma.archiveFolder.create({
        data: {
          fullPath: `X:\\${P}\\${name}`,
          folderName: `2015-03-04-${short} ${name} - ${title} ${P}`,
          parsedDate: new Date("2015-03-04"),
          parsedShortName: short,
          parsedTitle: `${title} ${P}`,
          isVideo: false,
          scannedAt: new Date(),
          tenant: "test",
        },
      });
    const hit = await folder("Almira Q", "Something Else");
    // Another channel, nobody known, another title: no evidence at all
    const miss = await folder("Nobody", "Unrelated", "ZMTY");
    // A stale catalogue suggestion and a hand marker on the folder that no longer matches
    await prisma.archiveFolderSuggestion.createMany({
      data: [
        { archiveFolderId: miss.id, icgId: "ZZ-95@OLD", name: "Old", source: "CATALOGUE", tier: "EXACT", score: 1, demotions: [] },
        { archiveFolderId: miss.id, icgId: "ZZ-95@HND", name: "Hand", source: "FOLDER_ATTRIBUTION", tier: "EXACT", score: 1, demotions: [] },
      ],
    });

    const result = await matchArchiveToCatalogue({ kind: "folders", ids: [hit.id, miss.id] });
    expect(result).toMatchObject({ folders: 2, matched: 1, byTier: { EXACT: 1, STRONG: 0, WEAK: 0 } });

    const [s] = await prisma.archiveFolderSuggestion.findMany({ where: { archiveFolderId: hit.id } });
    expect(s).toMatchObject({ icgId: "ZZ-95@AAA", name: "Alma Mtch", tier: "EXACT", demotions: [] });
    expect(s.evidence).toMatchObject({ matchedCoverId: `${P}-1`, channelAgrees: true, aliasAgrees: true, namedByAlias: true });
    const left = await prisma.archiveFolderSuggestion.findMany({ where: { archiveFolderId: miss.id }, select: { source: true } });
    expect(left).toEqual([{ source: "FOLDER_ATTRIBUTION" }]);
  });
});
