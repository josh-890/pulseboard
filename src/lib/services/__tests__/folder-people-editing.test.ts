import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  castDisagreement,
  confirmFolderIdentity,
  getWorkbenchFolder,
  removeFolderAttribution,
} from "@/lib/services/attribution-confirm-service";
import { normalizeForSearch } from "@/lib/normalize";

// Editing the people on one folder, from the archive list.
//
// Two rules carry this feature and both are easy to break by accident:
//
//   1. `getWorkbenchFolder` must NOT filter on UNSETTLED_FOLDER. Every other
//      loader does, which is why a folder settled long ago cannot be reached
//      anywhere — and that folder is exactly the one you open this way.
//   2. Removing people is per person. `U` drops all of them, so correcting a cast
//      of four used to mean retyping three.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway rows are
// prefixed and wiped in afterEach.

const PREFIX = "FPE-TEST";
const TENANT = "test";

afterEach(async () => {
  const folders = await prisma.archiveFolder.findMany({
    where: { folderName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.contact.deleteMany({ where: { name: { startsWith: PREFIX } } });
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
      parsedDate: new Date("2016-02-06T00:00:00.000Z"),
      parsedTitle: name,
    },
  });
}

describe("getWorkbenchFolder", () => {
  it("finds a folder whose link is confirmed — the queue never would", async () => {
    const folder = await seedFolder("Ibiza Backstage");
    const title = `${PREFIX} Ibiza Backstage`;
    const set = await prisma.set.create({
      data: { title, titleNorm: normalizeForSearch(title), type: "photo" },
    });
    await prisma.archiveLink.create({
      data: {
        archiveFolderId: folder.id,
        setId: set.id,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        tenant: TENANT,
      },
    });

    const found = await getWorkbenchFolder(folder.id);
    expect(found?.id).toBe(folder.id);
    expect(found?.folderName).toBe(`${PREFIX} Ibiza Backstage`);
  });

  it("returns null for an id that is not a folder", async () => {
    expect(await getWorkbenchFolder("no-such-folder")).toBeNull();
  });
});

describe("removeFolderAttribution", () => {
  it("takes one person off and leaves the rest confirmed", async () => {
    const folder = await seedFolder("Two People");
    await confirmFolderIdentity(folder.id, ["XX-0001", "XX-0002"], {
      "XX-0001": `${PREFIX} One`,
      "XX-0002": `${PREFIX} Two`,
    });

    const res = await removeFolderAttribution(folder.id, "XX-0001");
    expect(res).toEqual({ removed: true, remaining: 1 });

    const left = await prisma.archiveFolderAttribution.findMany({
      where: { archiveFolderId: folder.id },
      select: { icgId: true },
    });
    expect(left.map((a) => a.icgId)).toEqual(["XX-0002"]);

    const review = await prisma.archiveFolderReview.findUnique({
      where: { archiveFolderId: folder.id },
      select: { identity: true },
    });
    expect(review?.identity).toBe("CONFIRMED");
  });

  it("leaves the folder unanswered once the last person is gone", async () => {
    const folder = await seedFolder("One Person");
    await confirmFolderIdentity(folder.id, ["XX-0003"], { "XX-0003": `${PREFIX} Three` });

    const res = await removeFolderAttribution(folder.id, "XX-0003");
    expect(res).toEqual({ removed: true, remaining: 0 });
    // Same state `U` produces — no third kind of "answered" is invented.
    expect(
      await prisma.archiveFolderReview.findUnique({ where: { archiveFolderId: folder.id } }),
    ).toBeNull();
  });

  it("says so when there was nothing to remove", async () => {
    const folder = await seedFolder("Nobody");
    expect(await removeFolderAttribution(folder.id, "XX-0009")).toEqual({
      removed: false,
      remaining: 0,
    });
  });
});

describe("castDisagreement", () => {
  const cast = [{ icgId: "CA-924J" }, { icgId: "KC-1" }];

  it("names the people the set does not credit", () => {
    expect(castDisagreement(cast, ["CA-924J", "ZZ-9"], true)).toEqual(["ZZ-9"]);
  });

  it("is silent when the cast knows everyone", () => {
    expect(castDisagreement(cast, ["CA-924J"], true)).toEqual([]);
  });

  // An orphan folder contradicts nothing: there is no set to disagree with, and
  // warning there would fire on every folder in the archive.
  it("says nothing about a folder with no linked set", () => {
    expect(castDisagreement([], ["ZZ-9"], false)).toEqual([]);
  });

  // A linked set with an empty cast is a real disagreement — it credits nobody.
  it("flags everyone when a linked set credits nobody", () => {
    expect(castDisagreement([], ["ZZ-9"], true)).toEqual(["ZZ-9"]);
  });
});
