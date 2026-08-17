import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getAttributionQueue } from "@/lib/services/attribution-confirm-service";
import {
  castDisagreement,
  confirmFolderIdentity,
  getWorkbenchFolder,
  getWorkbenchFolderSession,
  removeFolderAttribution,
} from "@/lib/services/attribution-confirm-service";
import { normalizeForSearch } from "@/lib/normalize";
import { escapeLike } from "@/lib/prisma-like";

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
  // Keyed on fullPath, not folderName: a seed may need a realistic folder name
  // (`2016-02-06-KCQ Katya - …`) which does not start with the prefix, and rows
  // left behind collide on the next run through the unique fullPath.
  //
  // Through `escapeLike`, because the path contains backslashes and Postgres
  // reads those as LIKE escapes — the filter matched nothing, the folders
  // survived, and the *second* run of this file failed on the unique fullPath
  // while the first passed. Exactly what `prisma-like.ts` warns about.
  const folders = await prisma.archiveFolder.findMany({
    where: { fullPath: { startsWith: escapeLike(`X:\\${PREFIX}`) } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveFolderSuggestion.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolderReview.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.contact.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: PREFIX } } });
});

async function seedFolder(name: string, folderName?: string) {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: folderName ?? `${PREFIX} ${name}`,
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

describe("getWorkbenchFolderSession", () => {
  // A folder that suggests nobody still has candidates: they come from the other
  // folders sharing its alias, which is what the queue shows. Opening the folder
  // directly used to drop them and answer "no candidate for this folder" where
  // the queue answered with a name (seen on "KC Katya - Ibiza Backstage Part 1",
  // which carries no suggestion of its own).
  it("carries the alias group's votes for a folder that suggests nobody", async () => {
    const quiet = await seedFolder("quiet", `2016-02-06-${PREFIX}Q Katya - Quiet One`);
    const loud = await seedFolder("loud", `2016-03-06-${PREFIX}Q Katya - Loud One`);
    await prisma.archiveFolder.updateMany({
      where: { id: { in: [quiet.id, loud.id] } },
      data: { parsedShortName: `${PREFIX}Q` },
    });
    await prisma.archiveFolderSuggestion.create({
      data: {
        archiveFolderId: loud.id,
        icgId: "KY-0001",
        name: "Katya Clover",
        source: "CATALOGUE",
        tier: "EXACT",
        score: 1,
        demotions: [],
      },
    });

    const session = await getWorkbenchFolderSession(quiet.id);
    expect(session?.folders[0]?.suggestions).toEqual([]);
    expect(session?.votes.map((v) => v.icgId)).toEqual(["KY-0001"]);
    // Still a single-folder session: no group progress, no next group.
    expect(session?.key).toBeNull();
    expect(session?.nextGroupKey).toBeNull();
  });
});

describe("the marked view", () => {
  // A marker written *after* the folder was answered is new work. It used to
  // count as done — the folder was ruled on, so it left every view while the
  // person on disk had never been recorded. Seen with "Gina Gerson" on a folder
  // whose other two people had just been confirmed in the workbench.
  it("still offers a folder whose marker nobody confirmed, even once it is answered", async () => {
    // A channel code without a hyphen: the folder-name parser reads
    // `YYYY-MM-DD-SHORT Alias - Title`, and a hyphen inside SHORT makes the alias
    // unparseable, which would put the folder in the `FPEM|` group instead.
    const folder = await seedFolder("marked", "2016-02-06-FPEM Katya - Ibiza");
    await prisma.archiveFolder.update({
      where: { id: folder.id },
      data: { parsedShortName: "FPEM" },
    });
    // Answered: one person confirmed.
    await confirmFolderIdentity(folder.id, ["ZZ-0001"], { "ZZ-0001": `${PREFIX} Answered` });
    // And then a marker naming somebody else.
    await prisma.archiveFolderSuggestion.create({
      data: {
        archiveFolderId: folder.id,
        icgId: "GX-0002",
        name: `${PREFIX} Marked`,
        source: "FOLDER_ATTRIBUTION",
        tier: "EXACT",
        score: 1,
        demotions: [],
      },
    });

    const group = (await getAttributionQueue({ view: "marked" })).groups.find(
      (g) => g.key === "FPEM|katya",
    );
    expect(group, "the group must be offered under My markers").toBeDefined();
    expect(group?.unclaimedMarked).toBe(1);

    // Confirming the marker settles it: the group leaves the view.
    await confirmFolderIdentity(folder.id, ["GX-0002"], { "GX-0002": `${PREFIX} Marked` });
    const after = await getAttributionQueue({ view: "marked" });
    expect(after.groups.some((g) => g.key === "FPEM|katya")).toBe(false);
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
