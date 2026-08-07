import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findLinkedCollision, mergeIntoLinkedStagingSet } from "@/lib/services/import/linked-set-merge";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for the import collision of ADR-0028: when the archive
// already holds a set, the import runs into it rather than creating a twin.
//
// The failure this guards is quiet in both directions — a twin looks like a
// duplicate nobody made, and an over-eager merge silently rewrites a row that
// carries the archive link.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "LSC-TEST";
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
    await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

const DAY = new Date("2011-01-16T00:00:00.000Z");

/** The state the archive leaves behind: a stub staging set with a CONFIRMED link. */
async function seedArchiveSide(name: string, claims: { name: string; icgId: string }[]) {
  const channel = await prisma.channel.create({ data: { name: `${PREFIX} ${name} Channel` } });
  const title = `${PREFIX} ${name}`;
  const folder = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: `${PREFIX} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
  const stub = await prisma.stagingSet.create({
    data: {
      title,
      titleNorm: normalizeForSearch(title),
      channelName: channel.name,
      channelId: channel.id,
      releaseDate: DAY,
      isVideo: false,
      participants: claims,
      participantIcgIds: claims.map((c) => c.icgId).filter(Boolean),
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
  for (const c of claims.filter((c) => c.icgId)) {
    await prisma.archiveFolderAttribution.create({
      data: { archiveFolderId: folder.id, icgId: c.icgId, name: c.name },
    });
  }
  return { channel, folder, stub, title };
}

describe("import ↔ archive collision", () => {
  it("finds the row the archive already holds", async () => {
    const { channel, stub, title, folder } = await seedArchiveSide("Found", [
      { name: "Paula", icgId: "ZZ-96@PPP" },
    ]);

    const hit = await findLinkedCollision(channel.id, DAY, false, normalizeForSearch(title));
    expect(hit?.id).toBe(stub.id);
    expect(hit?.folderIds).toEqual([folder.id]);
  });

  it("ignores a staging set that carries no confirmed link", async () => {
    const channel = await prisma.channel.create({ data: { name: `${PREFIX} Unlinked Channel` } });
    const title = `${PREFIX} Unlinked`;
    await prisma.stagingSet.create({
      data: {
        title,
        titleNorm: normalizeForSearch(title),
        channelName: channel.name,
        channelId: channel.id,
        releaseDate: DAY,
        isVideo: false,
      },
    });

    expect(await findLinkedCollision(channel.id, DAY, false, normalizeForSearch(title))).toBeNull();
  });

  it("fills the stub, takes the cast from the import, and preserves the loser as a claim", async () => {
    const { stub, folder, title, channel } = await seedArchiveSide("Merge", [
      { name: "Paula", icgId: "ZZ-96@PPP" },
    ]);
    const collision = await findLinkedCollision(channel.id, DAY, false, normalizeForSearch(title));
    expect(collision).not.toBeNull();

    await mergeIntoLinkedStagingSet(
      collision!,
      { externalId: "ext-42", description: "from the publisher", imageCount: 88 },
      [
        { name: "Anna", icgId: "ZZ-96@AAA" },
        { name: "Bella", icgId: "ZZ-96@BBB" },
      ],
      [],
    );

    const after = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: stub.id },
      select: {
        externalId: true,
        description: true,
        imageCount: true,
        participantIcgIds: true,
        participantNamesNorm: true,
      },
    });
    expect(after.externalId).toBe("ext-42");
    expect(after.description).toBe("from the publisher");
    expect(after.imageCount).toBe(88);
    // The cast is the import's, exactly.
    expect(after.participantIcgIds.sort()).toEqual(["ZZ-96@AAA", "ZZ-96@BBB"]);
    expect(after.participantNamesNorm).toContain("anna");

    // Paula is not lost: she is a claim about the folder, which is where claims
    // live — and the contradiction session will now ask about her.
    const claims = await prisma.archiveFolderAttribution.findMany({
      where: { archiveFolderId: folder.id },
      select: { icgId: true },
    });
    expect(claims.map((c) => c.icgId)).toEqual(["ZZ-96@PPP"]);

    // Exactly one row for one real set — the whole point.
    expect(await prisma.stagingSet.count({ where: { title: { startsWith: PREFIX } } })).toBe(1);
    // And the link the archive side created is untouched.
    const link = await prisma.archiveLink.findUniqueOrThrow({ where: { archiveFolderId: folder.id } });
    expect(link.stagingSetId).toBe(stub.id);
    expect(link.status).toBe("CONFIRMED");
  });

  it("writes a claim for a hand-added cast member the import drops", async () => {
    // Nobody attributed this person on the folder — she was typed into the
    // staging set. Dropping her from the cast without writing the claim would
    // lose her outright.
    const { folder, title, channel } = await seedArchiveSide("HandAdded", []);
    await prisma.stagingSet.update({
      where: { id: (await findLinkedCollision(channel.id, DAY, false, normalizeForSearch(title)))!.id },
      data: {
        participants: [{ name: "Quinn", icgId: "ZZ-96@QQQ" }],
        participantIcgIds: ["ZZ-96@QQQ"],
      },
    });

    const collision = await findLinkedCollision(channel.id, DAY, false, normalizeForSearch(title));
    await mergeIntoLinkedStagingSet(collision!, {}, [{ name: "Anna", icgId: "ZZ-96@AAA" }], []);

    const claims = await prisma.archiveFolderAttribution.findMany({
      where: { archiveFolderId: folder.id },
      select: { icgId: true, name: true },
    });
    expect(claims).toEqual([{ icgId: "ZZ-96@QQQ", name: "Quinn" }]);
  });

  it("keeps a cast member the import cannot represent (no ICG-ID)", async () => {
    const { stub, folder, title, channel } = await seedArchiveSide("NoIcg", []);
    await prisma.stagingSet.update({
      where: { id: stub.id },
      data: { participants: [{ name: "Nameless One", icgId: "" }], participantIcgIds: [] },
    });

    const collision = await findLinkedCollision(channel.id, DAY, false, normalizeForSearch(title));
    const res = await mergeIntoLinkedStagingSet(
      collision!,
      {},
      [{ name: "Anna", icgId: "ZZ-96@AAA" }],
      [],
    );

    expect(res.keptWithoutIcgId).toBe(1);
    const after = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: stub.id },
      select: { participants: true },
    });
    expect(after.participants).toEqual([
      { name: "Anna", icgId: "ZZ-96@AAA" },
      { name: "Nameless One", icgId: "" },
    ]);
    // No claim could be written for her, so none was invented.
    expect(await prisma.archiveFolderAttribution.count({ where: { archiveFolderId: folder.id } })).toBe(0);
  });
});
