import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { linkFolderToStagingSet } from "@/lib/services/attribution-confirm-service";
import { createStagingSetFromOrphan } from "@/lib/services/archive-service";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for the union rule of ADR-0028: a folder carries claims, a
// set has a cast, and developing a folder onto an existing set may not fold the
// first into the second.
//
// This used to be unconditional, so developing a folder attributed to P onto an
// imported set credited to {A, B} produced a three-person set nobody had agreed
// to — and, worse, the contradiction became undetectable afterwards, because P
// now stood in the cast it contradicted.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "LFU-TEST";
const TENANT = "test";

afterEach(async () => {
  const folders = await prisma.archiveFolder.findMany({
    where: { folderName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const folderIds = folders.map((f) => f.id);
  if (folderIds.length) {
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: folderIds } } });
    await prisma.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: { in: folderIds } } });
    await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: folderIds } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: folderIds } } });
  }
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
});

async function makeFolder(name: string) {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: `${PREFIX} ${name}`,
      parsedTitle: `${PREFIX} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
}

async function makeStagingSet(title: string, participants: { name: string; icgId: string }[]) {
  return prisma.stagingSet.create({
    data: {
      title: `${PREFIX} ${title}`,
      titleNorm: normalizeForSearch(`${PREFIX} ${title}`),
      channelName: `${PREFIX} Channel`,
      participants,
      participantIcgIds: participants.map((p) => p.icgId),
    },
  });
}

async function attribute(folderId: string, icgId: string, name: string) {
  await prisma.archiveFolderAttribution.create({
    data: { archiveFolderId: folderId, icgId, name },
  });
}

const castOf = async (id: string) =>
  (await prisma.stagingSet.findUniqueOrThrow({ where: { id }, select: { participantIcgIds: true } }))
    .participantIcgIds;

describe("linkFolderToStagingSet — union only into an empty cast", () => {
  it("withholds a claim the set's cast contradicts, and says so", async () => {
    const folder = await makeFolder("Contested");
    const staging = await makeStagingSet("Contested", [
      { name: "Anna", icgId: "ZZ-91@AAA" },
      { name: "Bella", icgId: "ZZ-91@BBB" },
    ]);
    await attribute(folder.id, "ZZ-91@PPP", "Paula");

    const res = await linkFolderToStagingSet(folder.id, staging.id);

    expect(res.added).toBe(0);
    expect(res.withheld).toEqual([{ icgId: "ZZ-91@PPP", name: "Paula" }]);
    // The cast is untouched — this is the whole point.
    expect((await castOf(staging.id)).sort()).toEqual(["ZZ-91@AAA", "ZZ-91@BBB"]);
    // The link is still written: the folder really may be that set.
    const link = await prisma.archiveLink.findUnique({ where: { archiveFolderId: folder.id } });
    expect(link?.status).toBe("CONFIRMED");
    expect(link?.stagingSetId).toBe(staging.id);
  });

  it("still enriches a set that credits nobody", async () => {
    const folder = await makeFolder("Empty");
    const staging = await makeStagingSet("Empty", []);
    await attribute(folder.id, "ZZ-91@PPP", "Paula");

    const res = await linkFolderToStagingSet(folder.id, staging.id);

    expect(res.added).toBe(1);
    expect(res.withheld).toEqual([]);
    expect(await castOf(staging.id)).toEqual(["ZZ-91@PPP"]);
  });

  // Emptiness has to be decided once, up front: judging it per person would let
  // the first claim fill the cast and then withhold the second.
  it("writes every claim when the cast starts out empty", async () => {
    const folder = await makeFolder("TwoIntoEmpty");
    const staging = await makeStagingSet("TwoIntoEmpty", []);
    await attribute(folder.id, "ZZ-91@PPP", "Paula");
    await attribute(folder.id, "ZZ-91@QQQ", "Quinn");

    const res = await linkFolderToStagingSet(folder.id, staging.id);

    expect(res.added).toBe(2);
    expect(res.withheld).toEqual([]);
    expect((await castOf(staging.id)).sort()).toEqual(["ZZ-91@PPP", "ZZ-91@QQQ"]);
  });

  it("treats a person already in the cast as a no-op, not a conflict", async () => {
    const folder = await makeFolder("Agree");
    const staging = await makeStagingSet("Agree", [{ name: "Anna", icgId: "ZZ-91@AAA" }]);
    await attribute(folder.id, "ZZ-91@AAA", "Anna");

    const res = await linkFolderToStagingSet(folder.id, staging.id);

    expect(res.added).toBe(0);
    expect(res.withheld).toEqual([]);
    expect(await castOf(staging.id)).toEqual(["ZZ-91@AAA"]);
  });

  // A cast can name people the import never gave an ICG-ID for. Reading only
  // participantIcgIds would call that set "empty" and write into it.
  it("counts a cast named without ICG-IDs as a cast", async () => {
    const folder = await makeFolder("NoIcg");
    const staging = await makeStagingSet("NoIcg", [{ name: "Anna", icgId: "" }]);
    await attribute(folder.id, "ZZ-91@PPP", "Paula");

    const res = await linkFolderToStagingSet(folder.id, staging.id);

    expect(res.added).toBe(0);
    expect(res.withheld).toHaveLength(1);
  });
});

describe("createStagingSetFromOrphan", () => {
  // Without titleNorm, findProbableStagingDuplicate returns null and a later
  // import of the same set can never recognise this row — silent twins.
  it("writes titleNorm, so a later import can recognise the set", async () => {
    const folder = await makeFolder("Orphan");
    const { stagingSetId } = await createStagingSetFromOrphan(folder.id);

    const ss = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: stagingSetId },
      select: { title: true, titleNorm: true },
    });
    expect(ss.titleNorm).toBe(normalizeForSearch(ss.title));
    expect(ss.titleNorm).toBeTruthy();
  });
});
