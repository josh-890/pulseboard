import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createStagingSetFromFolder, developFolder } from "@/lib/services/attribution-confirm-service";
import { normalizeForSearch } from "@/lib/normalize";
import { escapeLike } from "@/lib/prisma-like";

// One folder, one way to become a staged set.
//
// There were two, and they disagreed on five things: who is in the set (the
// confirmed attribution vs. the alias parsed out of the folder name), whether an
// existing staged set is reused or duplicated, the cover, the status, and the
// review state. The archive row's dialogue built its own StagingSet and got all
// five wrong; both entry points now come through `createStagingSetFromFolder`.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway rows are
// keyed on fullPath and wiped in afterEach — through `escapeLike`, because a
// Windows path's backslashes are LIKE escapes in Postgres.

const PREFIX = "SSF-TEST";
const TENANT = "test";

afterEach(async () => {
  const folders = await prisma.archiveFolder.findMany({
    where: { fullPath: { startsWith: escapeLike(`X:\\${PREFIX}`) } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.contact.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

async function seedFolder(title: string) {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${title}`,
      folderName: `2016-02-06-SSF Katya - ${title}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
      parsedDate: new Date("2016-02-06T00:00:00.000Z"),
      parsedTitle: `${PREFIX} ${title}`,
      parsedShortName: "SSF",
      fileCount: 42,
      coverKey: `archive/${PREFIX}-${title}/cover.jpg`,
    },
  });
}

describe("createStagingSetFromFolder", () => {
  it("brings the cover, the link, PENDING and the review state", async () => {
    const folder = await seedFolder("With Cover");

    const res = await createStagingSetFromFolder(folder.id, {
      participants: [{ name: `${PREFIX} Katya`, icgId: "KY-0001" }],
    });
    expect(res.linkedExisting).toBe(false);
    expect(res.participants).toBe(1);

    const ss = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: res.stagingSetId },
      select: {
        title: true, titleNorm: true, status: true, coverImageUrl: true,
        participantIcgIds: true, participantStatuses: true,
        archiveLinks: { select: { status: true, archiveStatus: true, archiveFileCount: true } },
      },
    });
    expect(ss.coverImageUrl, "the folder's own cover").toContain("cover.jpg");
    expect(ss.status, "a folder-born set goes through review like any other").toBe("PENDING");
    expect(ss.titleNorm).toBe(normalizeForSearch(`${PREFIX} With Cover`));
    expect(ss.participantIcgIds).toEqual(["KY-0001"]);
    expect(ss.archiveLinks[0]).toMatchObject({
      status: "CONFIRMED",
      archiveStatus: "OK",
      archiveFileCount: 42,
    });

    const review = await prisma.archiveFolderReview.findUnique({
      where: { archiveFolderId: folder.id },
      select: { develop: true },
    });
    expect(review?.develop, "the folder leaves the develop queue").toBe("DEVELOPED");
  });

  it("takes the operator's corrections over what the folder name said", async () => {
    const folder = await seedFolder("Mis Parsed");
    const channel = await prisma.channel.create({
      data: { name: `${PREFIX} Channel`, shortName: `${PREFIX.slice(0, 4)}X` },
      select: { id: true, name: true },
    });

    const res = await createStagingSetFromFolder(folder.id, {
      participants: [],
      overrides: {
        title: `${PREFIX} Corrected Title`,
        channelId: channel.id,
        releaseDate: "2016-03-09",
        isVideo: true,
      },
    });

    const ss = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: res.stagingSetId },
      select: { title: true, titleNorm: true, channelId: true, channelName: true, releaseDate: true, isVideo: true },
    });
    expect(ss.title).toBe(`${PREFIX} Corrected Title`);
    expect(ss.titleNorm).toBe(normalizeForSearch(`${PREFIX} Corrected Title`));
    expect(ss.channelId).toBe(channel.id);
    expect(ss.channelName).toBe(channel.name);
    expect(ss.releaseDate?.toISOString().slice(0, 10)).toBe("2016-03-09");
    expect(ss.isVideo).toBe(true);

    await prisma.stagingSet.deleteMany({ where: { id: res.stagingSetId } });
    await prisma.channel.delete({ where: { id: channel.id } });
  });

  // The failure this guards against is a silent twin: one row holding the archive
  // link, another holding the import payload, neither complete.
  it("links to the staged set that already exists instead of duplicating it", async () => {
    const folder = await seedFolder("Already Here");
    const title = `${PREFIX} Already Here`;
    const existing = await prisma.stagingSet.create({
      data: {
        title,
        titleNorm: normalizeForSearch(title),
        channelName: `${PREFIX} Channel`,
        releaseDate: new Date("2016-02-06T00:00:00.000Z"),
        isVideo: false,
      },
      select: { id: true },
    });

    const res = await createStagingSetFromFolder(folder.id, {
      participants: [{ name: `${PREFIX} Katya`, icgId: "KY-0001" }],
    });
    expect(res.linkedExisting).toBe(true);
    expect(res.stagingSetId).toBe(existing.id);
    expect(await prisma.stagingSet.count({ where: { title: { startsWith: PREFIX } } })).toBe(1);
  });

  it("keeps the alias the set credited somebody under", async () => {
    const folder = await seedFolder("Alias");
    const res = await createStagingSetFromFolder(folder.id, {
      participants: [{ name: `${PREFIX} Katya Clover`, icgId: "KY-0002", usedName: "Katya" }],
    });
    const ss = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: res.stagingSetId },
      select: { participantStatuses: true },
    });
    const statuses = ss.participantStatuses as { usedName?: string }[];
    expect(statuses[0]?.usedName, "ADR-0024: the credited-as name survives the shared writer")
      .toBe("Katya");
  });
});

describe("developFolder", () => {
  it("produces exactly what the dialogue does, from the folder's attributions", async () => {
    const folder = await seedFolder("One Click");
    await prisma.archiveFolderAttribution.create({
      data: { archiveFolderId: folder.id, icgId: "KY-0003", name: `${PREFIX} Katya` },
    });

    const res = await developFolder(folder.id);
    const ss = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: res.stagingSetId },
      select: { status: true, coverImageUrl: true, participantIcgIds: true },
    });
    expect(ss.status).toBe("PENDING");
    expect(ss.coverImageUrl).toContain("cover.jpg");
    expect(ss.participantIcgIds).toEqual(["KY-0003"]);
  });

  it("refuses a folder nobody has confirmed", async () => {
    const folder = await seedFolder("Unconfirmed");
    await expect(developFolder(folder.id)).rejects.toThrow(/confirmed/i);
  });
});
