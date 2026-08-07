import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBatch } from "@/lib/services/import/staging-service";
import { normalizeForSearch } from "@/lib/normalize";

// End-to-end test for the collision wiring of ADR-0028: a real import file,
// through the real ingest, onto a set the archive already holds.
//
// The unit tests cover the merge itself; this covers the part that only breaks in
// place — whether the ingest loop reaches the merge at all, and whether it stops
// creating the row it would otherwise have created. A twin is quiet: it looks
// like a duplicate nobody made.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "ICE-TEST";
const TENANT = "test";
const CHANNEL = `${PREFIX} Channel`;
const TITLE = `${PREFIX} The Delicate Edge`;
const DAY = new Date("2011-01-16T00:00:00.000Z");

afterEach(async () => {
  const folders = await prisma.archiveFolder.findMany({
    where: { folderName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
  const batches = await prisma.importBatch.findMany({
    where: { filename: { startsWith: PREFIX } },
    select: { id: true },
  });
  if (batches.length) {
    const batchIds = batches.map((b) => b.id);
    await prisma.importItem.deleteMany({ where: { batchId: { in: batchIds } } });
    await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  }
  await prisma.channel.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

/** The state a developed archive folder leaves behind: a stub plus a claim. */
async function seedArchiveSide() {
  const channel = await prisma.channel.create({
    // nameNorm is what `matchChannel` matches on: without it the import cannot
    // resolve the channel, channelId stays null, and there is no collision key at
    // all. Lower-casing is that matcher's normalisation for an unaccented name.
    data: { name: CHANNEL, nameNorm: CHANNEL.toLowerCase() },
  });
  const folder = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\edge`,
      folderName: `${PREFIX} 2011-01-16-CH Paula - The Delicate Edge`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
  const stub = await prisma.stagingSet.create({
    data: {
      title: TITLE,
      titleNorm: normalizeForSearch(TITLE),
      channelName: CHANNEL,
      channelId: channel.id,
      releaseDate: DAY,
      isVideo: false,
      participants: [{ name: "Paula", icgId: "ZZ-97@PPP" }],
      participantIcgIds: ["ZZ-97@PPP"],
    },
  });
  await prisma.archiveLink.create({
    data: {
      archiveFolderId: folder.id,
      stagingSetId: stub.id,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      tenant: TENANT,
    },
  });
  await prisma.archiveFolderAttribution.create({
    data: { archiveFolderId: folder.id, icgId: "ZZ-97@PPP", name: "Paula" },
  });
  return { channel, folder, stub };
}

const importFile = (icgId: string) => `URL: https://example.invalid/${icgId}
Name (extrahiert): ${PREFIX} Subject
Slug: ${PREFIX.toLowerCase()}-subject
ICGID : ${icgId}

=== Links aus 'Other Links' ===

Titeltxt : ${TITLE} — long form
Covertitle : ${TITLE}
CoverId : ${PREFIX}-ext-42
Channel : ${CHANNEL}
Date : 2011-01-16
Description : straight from the publisher
Coverimg : https://example.invalid/cover.jpg
Imagenumber : 88
Video : false
ModelsCount : 2
ModelsList : Anna_(ZZ-97@AAA)[https://example.invalid/a], Bella_(ZZ-97@BBB)[https://example.invalid/b]
`;

describe("an import landing on a set the archive already holds", () => {
  it("runs into the existing row instead of creating a twin", async () => {
    const { stub, folder } = await seedArchiveSide();

    const batch = await createBatch(`${PREFIX}-subject.txt`, importFile("ZZ-97@SUB"));

    // One row for one real set.
    const rows = await prisma.stagingSet.findMany({
      where: { title: { startsWith: PREFIX } },
      select: { id: true, externalId: true, description: true, imageCount: true, participantIcgIds: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(stub.id);

    // The stub was filled with what only the publisher knew…
    expect(rows[0].externalId).toBe(`${PREFIX}-ext-42`);
    expect(rows[0].description).toBe("straight from the publisher");
    expect(rows[0].imageCount).toBe(88);
    // …and the cast is the import's.
    expect(rows[0].participantIcgIds.sort()).toEqual(["ZZ-97@AAA", "ZZ-97@BBB"]);

    // Paula fell out of the cast but is not lost — she is a claim on the folder,
    // and the contradiction session will ask about her.
    const claims = await prisma.archiveFolderAttribution.findMany({
      where: { archiveFolderId: folder.id },
      select: { icgId: true },
    });
    expect(claims.map((c) => c.icgId)).toEqual(["ZZ-97@PPP"]);

    // The archive link is untouched.
    const link = await prisma.archiveLink.findUniqueOrThrow({ where: { archiveFolderId: folder.id } });
    expect(link.stagingSetId).toBe(stub.id);
    expect(link.status).toBe("CONFIRMED");

    // And the batch says so, rather than reporting a creation.
    const summary = (await prisma.importBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { stagingSummary: true },
    })).stagingSummary as { created: number; merged: number } | null;
    expect(summary?.merged).toBe(1);
    expect(summary?.created).toBe(0);
  });

  it("creates normally when the archive holds nothing", async () => {
    await prisma.channel.create({ data: { name: CHANNEL, nameNorm: CHANNEL.toLowerCase() } });

    await createBatch(`${PREFIX}-subject2.txt`, importFile("ZZ-97@SU2"));

    const rows = await prisma.stagingSet.findMany({
      where: { title: { startsWith: PREFIX } },
      select: { participantIcgIds: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].participantIcgIds.sort()).toEqual(["ZZ-97@AAA", "ZZ-97@BBB"]);
  });
});
