import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getSuggestedFoldersForStagingSets } from "@/lib/services/archive-service";
import { normalizeForSearch } from "@/lib/normalize";

// Promotion moves the archive link from the StagingSet to the Set. The suggestion
// loader looked only at stagingSetId, so a promoted row found nothing — and the UI
// then said "Not in archive", the same words it uses for a set nobody knows anything
// about, while a HIGH-confidence proposal sat on the Set with no way to act on it.
//
// Found on "Set 383932 AMATEURS" (ATKPetites): the folder was on disk, proposed, and
// invisible. The failure is silent by nature — the row looks settled.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "PSG-TEST";
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
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: PREFIX } } });
});

async function seedFolder(name: string) {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: `${PREFIX} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
      parsedDate: new Date("2021-05-07T00:00:00.000Z"),
      parsedTitle: name,
    },
  });
}

describe("getSuggestedFoldersForStagingSets", () => {
  it("finds the suggestion of a PROMOTED staging set, which lives on the Set", async () => {
    const title = `${PREFIX} Set 383932`;
    const set = await prisma.set.create({
      data: { title, titleNorm: normalizeForSearch(title), type: "photo",
              releaseDate: new Date("2021-05-07T00:00:00.000Z") },
    });
    const staging = await prisma.stagingSet.create({
      data: {
        title, titleNorm: normalizeForSearch(title), channelName: `${PREFIX} Channel`,
        releaseDate: new Date("2021-05-07T00:00:00.000Z"),
        status: "PROMOTED", promotedSetId: set.id,
      },
    });
    const folder = await seedFolder("Set 383932");
    await prisma.archiveLink.create({
      data: { archiveFolderId: folder.id, setId: set.id, status: "SUGGESTED",
              confidence: "HIGH", tenant: TENANT },
    });

    const found = await getSuggestedFoldersForStagingSets([staging.id]);

    // Keyed on the staging set, because that is what the caller asked about.
    expect(found.get(staging.id)?.folderId).toBe(folder.id);
    expect(found.get(staging.id)?.confidence).toBe("HIGH");
    // The agreement is described against the Set, so the badge can stay honest.
    expect(found.get(staging.id)?.dateMatches).toBe(true);
  });

  it("still finds an unpromoted staging set's own suggestion", async () => {
    const title = `${PREFIX} Pending`;
    const staging = await prisma.stagingSet.create({
      data: { title, titleNorm: normalizeForSearch(title), channelName: `${PREFIX} Channel`,
              releaseDate: new Date("2021-05-07T00:00:00.000Z") },
    });
    const folder = await seedFolder("Pending");
    await prisma.archiveLink.create({
      data: { archiveFolderId: folder.id, stagingSetId: staging.id, status: "SUGGESTED",
              confidence: "MEDIUM", tenant: TENANT },
    });

    const found = await getSuggestedFoldersForStagingSets([staging.id]);
    expect(found.get(staging.id)?.folderId).toBe(folder.id);
    expect(found.get(staging.id)?.confidence).toBe("MEDIUM");
  });

  // A confirmed link is not a suggestion; offering to confirm it again would be noise.
  it("ignores a confirmed link", async () => {
    const title = `${PREFIX} Confirmed`;
    const set = await prisma.set.create({
      data: { title, titleNorm: normalizeForSearch(title), type: "photo" },
    });
    const staging = await prisma.stagingSet.create({
      data: { title, titleNorm: normalizeForSearch(title), channelName: `${PREFIX} Channel`,
              status: "PROMOTED", promotedSetId: set.id },
    });
    const folder = await seedFolder("Confirmed");
    await prisma.archiveLink.create({
      data: { archiveFolderId: folder.id, setId: set.id, status: "CONFIRMED",
              confirmedAt: new Date(), tenant: TENANT },
    });

    expect((await getSuggestedFoldersForStagingSets([staging.id])).size).toBe(0);
  });
});
