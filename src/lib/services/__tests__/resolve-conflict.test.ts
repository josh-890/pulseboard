import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getConflictSession, resolveConflict } from "@/lib/services/conflict-session-service";
import { normalizeForSearch } from "@/lib/normalize";

// DB-integration test for the three answers of ADR-0028. Each one has to leave
// the data in a state where the contradiction is genuinely gone — the session is
// computed, so a wrong write does not merely mislead, it makes the row reappear
// forever or vanish without having been decided.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "RSC-TEST";
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
});

async function seed(name: string, claims: { icgId: string; name: string }[]) {
  const folder = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: `${PREFIX} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
    },
  });
  const staging = await prisma.stagingSet.create({
    data: {
      title: `${PREFIX} ${name}`,
      titleNorm: normalizeForSearch(`${PREFIX} ${name}`),
      channelName: `${PREFIX} Channel`,
      participants: [{ name: "Anna", icgId: "ZZ-93@AAA" }],
      participantIcgIds: ["ZZ-93@AAA"],
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
  await prisma.archiveFolderReview.create({
    data: { archiveFolderId: folder.id, identity: "CONFIRMED", identityAt: new Date() },
  });
  for (const c of claims) {
    await prisma.archiveFolderAttribution.create({
      data: { archiveFolderId: folder.id, icgId: c.icgId, name: c.name },
    });
  }
  return { folder, staging };
}

const rowsFor = async (folderId: string) =>
  (await getConflictSession()).folders.filter((f) => f.folderId === folderId);

describe("the contradiction session", () => {
  it("puts both claims on the table, with the cast", async () => {
    const { folder, staging } = await seed("Session", [{ icgId: "ZZ-93@PPP", name: "Paula" }]);

    const rows = await rowsFor(folder.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].claim).toEqual({ icgId: "ZZ-93@PPP", name: "Paula" });
    expect(rows[0].target.id).toBe(staging.id);
    expect(rows[0].target.cast).toEqual([{ name: "Anna", icgId: "ZZ-93@AAA" }]);
    expect(rows[0].claimsOnFolder).toBe(1);
  });

  it("'the set is right' drops the claim and never proposes them here again", async () => {
    const { folder } = await seed("ImportRight", [{ icgId: "ZZ-93@PPP", name: "Paula" }]);

    await resolveConflict(folder.id, "ZZ-93@PPP", "import-right");

    expect(await rowsFor(folder.id)).toHaveLength(0);
    expect(
      await prisma.archiveFolderAttribution.count({ where: { archiveFolderId: folder.id } }),
    ).toBe(0);
    const review = await prisma.archiveFolderReview.findUniqueOrThrow({
      where: { archiveFolderId: folder.id },
    });
    expect(review.rejectedIcgIds).toContain("ZZ-93@PPP");
    // The last claim went, so the folder's identity closes with it.
    expect(review.identity).toBe("REJECTED");
  });

  it("keeps the folder confirmed while another claim survives", async () => {
    const { folder } = await seed("TwoClaims", [
      { icgId: "ZZ-93@PPP", name: "Paula" },
      { icgId: "ZZ-93@QQQ", name: "Quinn" },
    ]);
    expect(await rowsFor(folder.id)).toHaveLength(2);

    await resolveConflict(folder.id, "ZZ-93@PPP", "import-right");

    const review = await prisma.archiveFolderReview.findUniqueOrThrow({
      where: { archiveFolderId: folder.id },
    });
    expect(review.identity).toBe("CONFIRMED");
    expect(await rowsFor(folder.id)).toHaveLength(1);
  });

  it("'I am right' writes the person into the staging cast", async () => {
    const { folder, staging } = await seed("ClaimRight", [{ icgId: "ZZ-93@PPP", name: "Paula" }]);

    const res = await resolveConflict(folder.id, "ZZ-93@PPP", "claim-right");
    expect(res.resolved).toBe(true);

    const ss = await prisma.stagingSet.findUniqueOrThrow({
      where: { id: staging.id },
      select: { participantIcgIds: true },
    });
    expect(ss.participantIcgIds.sort()).toEqual(["ZZ-93@AAA", "ZZ-93@PPP"]);
    // The claim is now part of the cast, so there is nothing left to contradict.
    expect(await rowsFor(folder.id)).toHaveLength(0);
  });

  it("'wrong link' unlinks the folder and leaves the claim standing", async () => {
    const { folder } = await seed("WrongLink", [{ icgId: "ZZ-93@PPP", name: "Paula" }]);

    await resolveConflict(folder.id, "ZZ-93@PPP", "wrong-link");

    expect(await prisma.archiveLink.count({ where: { archiveFolderId: folder.id } })).toBe(0);
    expect(
      await prisma.archiveFolderAttribution.count({ where: { archiveFolderId: folder.id } }),
    ).toBe(1);
    // Nothing to compare against any more — the folder is back in the
    // attribution population, claim intact.
    expect(await rowsFor(folder.id)).toHaveLength(0);
  });
});
