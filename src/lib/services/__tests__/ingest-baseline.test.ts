import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ingestScanResults } from "@/lib/services/archive-service";

// DB-integration test for the baseline ingest.
//
// CHANGED is derived from the file count moving, which only means "someone edited
// this set" while both counts came from the same counting rule. When the rule
// changed to media-only, every link reported a drop — 276 sets had already been
// flagged by nothing more than a people file appearing next to the images.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "IBL-TEST";
const TENANT = "test";

afterEach(async () => {
  const folders = await prisma.archiveFolder.findMany({
    where: { folderName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
});

/** A confirmed link whose recorded count is `fileCount`. */
async function seed(name: string, fileCount: number) {
  const folder = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: `${PREFIX} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
  const link = await prisma.archiveLink.create({
    data: {
      archiveFolderId: folder.id,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      archivePath: `${PREFIX}\\${name}`,
      archiveStatus: "OK",
      archiveFileCount: fileCount,
      tenant: TENANT,
    },
  });
  return { folder, link };
}

const scanResult = (linkId: string, path: string, fileCount: number) => ({
  archiveLinkId: linkId,
  path,
  exists: true,
  fileCount,
  videoPresent: null,
  videoFiles: null,
  error: null,
});

const statusOf = async (id: string) =>
  (await prisma.archiveLink.findUniqueOrThrow({ where: { id }, select: { archiveStatus: true, archiveFileCount: true } }));

describe("ingestScanResults", () => {
  it("flags a set whose file count moved", async () => {
    const { link } = await seed("Edited", 40);

    await ingestScanResults([scanResult(link.id, `X:\\${PREFIX}\\Edited`, 39)]);

    expect(await statusOf(link.id)).toEqual({ archiveStatus: "CHANGED", archiveFileCount: 39 });
  });

  // The one run after the counting rule changes: the number moved because the rule
  // moved, and reading that as damage would flag every confirmed link at once.
  it("stores the new count without flagging it when baselining", async () => {
    const { link } = await seed("Rebaselined", 40);

    await ingestScanResults([scanResult(link.id, `X:\\${PREFIX}\\Rebaselined`, 39)], { baseline: true });

    expect(await statusOf(link.id)).toEqual({ archiveStatus: "OK", archiveFileCount: 39 });
  });

  it("clears a flag that only the old rule produced", async () => {
    const { link } = await seed("AlreadyFlagged", 41);
    await prisma.archiveLink.update({ where: { id: link.id }, data: { archiveStatus: "CHANGED" } });

    await ingestScanResults([scanResult(link.id, `X:\\${PREFIX}\\AlreadyFlagged`, 40)], { baseline: true });

    expect((await statusOf(link.id)).archiveStatus).toBe("OK");
  });

  // Baseline says "trust the count", not "trust everything": a folder that is gone
  // is still gone.
  it("still reports a folder that is missing", async () => {
    const { link } = await seed("Gone", 40);

    await ingestScanResults(
      [{ ...scanResult(link.id, `X:\\${PREFIX}\\Gone`, 0), exists: false, fileCount: null }],
      { baseline: true },
    );

    expect((await statusOf(link.id)).archiveStatus).toBe("MISSING");
  });
});
