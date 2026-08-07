import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getAttributionLinkAudit } from "@/lib/services/maintenance-service";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for the attribution ↔ link contradiction detector.
//
// The bug class it guards is silent by construction: `confirmArchiveLink` never
// reads the folder's attributions, so a folder attributed to P can end up linked
// to a set the import says is {A, B} with nothing said. A detector that misses
// that is worse than none, because zero would read as "healthy".
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "ALC-TEST";
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
    await prisma.archiveFolder.deleteMany({ where: { id: { in: folderIds } } });
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

async function makeStagingSet(title: string, participants: { name: string; icgId: string }[]) {
  return prisma.stagingSet.create({
    data: {
      title: `${PREFIX} ${title}`,
      titleNorm: normalizeForSearch(`${PREFIX} ${title}`),
      channelName: `${PREFIX} Channel`,
      participants,
      participantIcgIds: participants.map((p) => p.icgId),
      participantNamesNorm: participants.map((p) => normalizeForSearch(p.name)).join(", "),
    },
  });
}

async function link(folderId: string, stagingSetId: string) {
  await prisma.archiveLink.create({
    data: {
      archiveFolderId: folderId,
      stagingSetId,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      tenant: TENANT,
    },
  });
}

async function attribute(folderId: string, icgId: string, name: string) {
  await prisma.archiveFolderAttribution.create({
    data: { archiveFolderId: folderId, icgId, name },
  });
}

const forFolder = (
  audit: Awaited<ReturnType<typeof getAttributionLinkAudit>>,
  folderId: string,
) => audit.conflicts.filter((r) => r.folderId === folderId);

describe("getAttributionLinkAudit", () => {
  it("flags a folder attributed to someone the linked set does not list", async () => {
    const folder = await makeFolder("Conflict");
    const staging = await makeStagingSet("Conflict", [
      { name: "Anna", icgId: "ZZ-90@AAA" },
      { name: "Bella", icgId: "ZZ-90@BBB" },
    ]);
    await link(folder.id, staging.id);
    await attribute(folder.id, "ZZ-90@PPP", "Paula");

    const rows = forFolder(await getAttributionLinkAudit(), folder.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].attributedIcgId).toBe("ZZ-90@PPP");
    expect(rows[0].attributedName).toBe("Paula");
    expect(rows[0].kind).toBe("staging");
    expect(rows[0].targetId).toBe(staging.id);
    // The other side is spelled out as Name (ICG-ID) — an alias alone identifies nobody.
    expect(rows[0].targetParticipants).toContain("Anna (ZZ-90@AAA)");
    expect(rows[0].targetParticipants).toContain("Bella (ZZ-90@BBB)");
  });

  it("stays silent when the attribution is among the participants", async () => {
    const folder = await makeFolder("Agree");
    const staging = await makeStagingSet("Agree", [
      { name: "Anna", icgId: "ZZ-90@AAA" },
      { name: "Bella", icgId: "ZZ-90@BBB" },
    ]);
    await link(folder.id, staging.id);
    await attribute(folder.id, "ZZ-90@AAA", "Anna");

    expect(forFolder(await getAttributionLinkAudit(), folder.id)).toHaveLength(0);
  });

  // A set that names nobody is missing information, not a contradiction. Folding
  // those in would bury the real signal — most unlinked imports name nobody.
  it("stays silent when the linked set lists no one at all", async () => {
    const folder = await makeFolder("Empty");
    const staging = await makeStagingSet("Empty", []);
    await link(folder.id, staging.id);
    await attribute(folder.id, "ZZ-90@PPP", "Paula");

    expect(forFolder(await getAttributionLinkAudit(), folder.id)).toHaveLength(0);
  });

  // A suggestion is not a claim; only a confirmed link asserts "this is that set".
  it("ignores a link that is only SUGGESTED", async () => {
    const folder = await makeFolder("Suggested");
    const staging = await makeStagingSet("Suggested", [{ name: "Anna", icgId: "ZZ-90@AAA" }]);
    await prisma.archiveLink.create({
      data: {
        archiveFolderId: folder.id,
        stagingSetId: staging.id,
        status: "SUGGESTED",
        confidence: "HIGH",
        tenant: TENANT,
      },
    });
    await attribute(folder.id, "ZZ-90@PPP", "Paula");

    expect(forFolder(await getAttributionLinkAudit(), folder.id)).toHaveLength(0);
  });

  it("reports one row per contradicting person, not per folder", async () => {
    const folder = await makeFolder("Two");
    const staging = await makeStagingSet("Two", [{ name: "Anna", icgId: "ZZ-90@AAA" }]);
    await link(folder.id, staging.id);
    await attribute(folder.id, "ZZ-90@PPP", "Paula");
    await attribute(folder.id, "ZZ-90@QQQ", "Quinn");
    await attribute(folder.id, "ZZ-90@AAA", "Anna");

    const rows = forFolder(await getAttributionLinkAudit(), folder.id);
    expect(rows.map((r) => r.attributedIcgId).sort()).toEqual(["ZZ-90@PPP", "ZZ-90@QQQ"]);
  });
});
