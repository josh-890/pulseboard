import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getPeopleFiles, getPeopleRevisions } from "@/lib/services/archive-people-service";
import {
  coerceFolderPeople,
  coerceStrings,
  upsertArchiveFolders,
  type FullIngestItem,
} from "@/lib/services/archive-service";
import { parsePeopleFile, EMPTY_REVISION } from "@/lib/archive-people-file";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for the people files on disk (ADR-0029), both directions.
//
// What is easy to get wrong here is silent: a file that renders the wrong section,
// a revision that never changes (so the agent stops refreshing), or a hand-written
// line that vanishes without a word. Each of those looks like success.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "APS-TEST";
const TENANT = "test";

afterEach(async () => {
  const folders = await prisma.archiveFolder.findMany({
    where: { folderName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderSuggestion.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
});

async function makeFolder(name: string) {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: `${PREFIX} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
}

const revisionOf = async (archiveKey: string) =>
  (await getPeopleRevisions()).find((r) => r.archiveKey === archiveKey)?.revision;

const bodyOf = async (archiveKey: string) =>
  (await getPeopleFiles([archiveKey]))[0]?.body ?? null;

describe("what the app puts on disk", () => {
  it("writes the cast and the claims into separate sections", async () => {
    const folder = await makeFolder("Both");
    const staging = await prisma.stagingSet.create({
      data: {
        title: `${PREFIX} The Delicate Edge`,
        titleNorm: normalizeForSearch(`${PREFIX} The Delicate Edge`),
        channelName: "MPL Studios",
        releaseDate: new Date("2011-01-16T00:00:00.000Z"),
        participants: [{ name: "Anna", icgId: "ZZ-80@AAA" }],
        participantIcgIds: ["ZZ-80@AAA"],
      },
    });
    await prisma.archiveLink.create({
      data: {
        archiveFolderId: folder.id,
        stagingSetId: staging.id,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        tenant: TENANT,
      },
    });
    await prisma.archiveFolderAttribution.create({
      data: { archiveFolderId: folder.id, icgId: "ZZ-80@PPP", name: "Paula" },
    });

    const body = await bodyOf(folder.archiveKey);
    expect(body).not.toBeNull();
    const parsed = parsePeopleFile(body!);
    expect(parsed.credited).toEqual([{ name: "Anna", icgId: "ZZ-80@AAA" }]);
    expect(parsed.claimed).toEqual([{ name: "Paula", icgId: "ZZ-80@PPP" }]);
    // The header identifies the folder and the set it belongs to, so a copied
    // folder still says what it is.
    expect(body).toContain(folder.archiveKey);
    expect(body).toContain("The Delicate Edge");
    expect(parsed.revision).toBe(await revisionOf(folder.archiveKey));
  });

  it("says EMPTY and writes no body when it knows nobody", async () => {
    const folder = await makeFolder("Nobody");
    expect(await revisionOf(folder.archiveKey)).toBe(EMPTY_REVISION);
    expect(await bodyOf(folder.archiveKey)).toBeNull();
  });

  // Without this the agent would stop refreshing after the first write, which is
  // exactly how _pulseboard.json came to hold a stale setId.
  it("changes the revision when the people change", async () => {
    const folder = await makeFolder("Changing");
    await prisma.archiveFolderAttribution.create({
      data: { archiveFolderId: folder.id, icgId: "ZZ-80@PPP", name: "Paula" },
    });
    const first = await revisionOf(folder.archiveKey);
    expect(first).not.toBe(EMPTY_REVISION);

    await prisma.archiveFolderAttribution.create({
      data: { archiveFolderId: folder.id, icgId: "ZZ-80@QQQ", name: "Quinn" },
    });
    expect(await revisionOf(folder.archiveKey)).not.toBe(first);
  });

  it("leaves out a cast member the import never gave an ICG-ID", async () => {
    const folder = await makeFolder("NoIcg");
    const staging = await prisma.stagingSet.create({
      data: {
        title: `${PREFIX} Nameless`,
        titleNorm: normalizeForSearch(`${PREFIX} Nameless`),
        channelName: "MPL Studios",
        participants: [
          { name: "Anna", icgId: "ZZ-80@AAA" },
          { name: "Nameless One", icgId: "" },
        ],
        participantIcgIds: ["ZZ-80@AAA"],
      },
    });
    await prisma.archiveLink.create({
      data: {
        archiveFolderId: folder.id,
        stagingSetId: staging.id,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        tenant: TENANT,
      },
    });

    // A person without an ID cannot be found again by grep, and an unidentifiable
    // name is what these files exist to avoid.
    const parsed = parsePeopleFile((await bodyOf(folder.archiveKey))!);
    expect(parsed.credited).toEqual([{ name: "Anna", icgId: "ZZ-80@AAA" }]);
  });
});

describe("what a hand-written _people.txt does", () => {
  const ingestItem = (fullPath: string, folderName: string, extra: Partial<FullIngestItem>): FullIngestItem => ({
    action: "create",
    fullPath,
    isVideo: false,
    fileCount: 12,
    videoPresent: null,
    videoFiles: null,
    folderName,
    contentSignature: "aaaaaaaaaaaaaaaa",
    leafDirModifiedAt: new Date().toISOString(),
    yearDirModifiedAt: new Date().toISOString(),
    chanFolderModifiedAt: new Date().toISOString(),
    parsedDate: null,
    parsedShortName: null,
    parsedTitle: null,
    nameFormatOk: true,
    chanFolderName: null,
    ...extra,
  });

  it("lands as a top-ranked suggestion, and reports what it could not read", async () => {
    const fullPath = `X:\\${PREFIX}\\Hand`;
    const counts = await upsertArchiveFolders(
      [
        ingestItem(fullPath, `${PREFIX} Hand`, {
          folderPeople: [{ name: "Paula", icgId: "ZZ-80@PPP" }],
          folderPeopleErrors: ["who even is this"],
        }),
      ],
      TENANT,
    );

    expect(counts.folderPeople.written).toBe(1);
    // Malformed lines are surfaced with their folder, not dropped.
    expect(counts.folderPeople.badLines).toEqual([`${fullPath}: who even is this`]);

    const suggestions = await prisma.archiveFolderSuggestion.findMany({
      where: { archiveFolder: { fullPath } },
      select: { icgId: true, source: true, tier: true },
    });
    expect(suggestions).toEqual([{ icgId: "ZZ-80@PPP", source: "FOLDER_ATTRIBUTION", tier: "EXACT" }]);
  });

  // Decision 6 of ADR-0029: the file only ever adds. An unattended scan reading a
  // truncated file must not be able to undo a confirmation.
  it("does not withdraw anything when the line disappears", async () => {
    const fullPath = `X:\\${PREFIX}\\Withdraw`;
    await upsertArchiveFolders(
      [ingestItem(fullPath, `${PREFIX} Withdraw`, { folderPeople: [{ name: "Paula", icgId: "ZZ-80@PPP" }] })],
      TENANT,
    );

    await upsertArchiveFolders(
      [ingestItem(fullPath, `${PREFIX} Withdraw`, { action: "unchanged", folderPeople: [] })],
      TENANT,
    );

    expect(
      await prisma.archiveFolderSuggestion.count({ where: { archiveFolder: { fullPath } } }),
    ).toBe(1);
  });
});

describe("the PowerShell array collapse", () => {
  // ConvertTo-Json turns a one-element array into a scalar, and a one-person set is
  // the common case — this project has shipped that bug once already (2e5f442).
  it("accepts a single person that arrived as an object", () => {
    expect(coerceFolderPeople({ name: "Paula", icgId: "ZZ-80@PPP" })).toEqual([
      { name: "Paula", icgId: "ZZ-80@PPP" },
    ]);
    expect(coerceStrings("one bad line")).toEqual(["one bad line"]);
  });

  it("drops entries with no ICG-ID rather than inventing one", () => {
    expect(coerceFolderPeople([{ name: "Nameless" }, { name: "P", icgId: "ZZ-80@PPP" }])).toEqual([
      { name: "P", icgId: "ZZ-80@PPP" },
    ]);
  });

  it("falls back to the ID when the name is missing", () => {
    expect(coerceFolderPeople([{ icgId: "ZZ-80@PPP" }])).toEqual([
      { name: "ZZ-80@PPP", icgId: "ZZ-80@PPP" },
    ]);
  });

  it("is empty-safe", () => {
    expect(coerceFolderPeople(null)).toEqual([]);
    expect(coerceFolderPeople(undefined)).toEqual([]);
    expect(coerceStrings(null)).toEqual([]);
  });
});
