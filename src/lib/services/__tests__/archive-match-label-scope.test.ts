import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getConflictingLinks,
  runMatchingPass,
  runMatchingPassForItem,
} from "@/lib/services/archive-service";
import { normalizeForSearch } from "@/lib/normalize";
import { escapeLike } from "@/lib/prisma-like";

// The archive is matched by owning Label, not by channel code (ADR-0020).
//
// Nubiles files its NubileFilms sets under `NBL-Nubiles`: the folder says `NBL`,
// the staged set's channel is `NBLF`, both channels belong to the Label "Nubiles".
// The matcher compared the codes for equality, so the pair could never meet — no
// suggestion, no "folder taken" hint, and the manual picker filtered it out too.
//
// Runs against the DEV database (vitest.config.ts loads .env). Channel codes are
// unique to this file; everything is wiped in afterEach.

const PREFIX = "LSCOPE-TEST";
const TENANT = "lscope-test";
const DAY = new Date("2016-12-24T00:00:00.000Z");
const TITLE = "From Head To Toe";

let ownCh = "";
let siblingCh = "";
let strangerCh = "";

async function cleanup() {
  const folders = await prisma.archiveFolder.findMany({
    where: { fullPath: { startsWith: escapeLike(`X:\\${PREFIX}`) } },
    select: { id: true },
  });
  const ids = folders.map((f) => f.id);
  if (ids.length) {
    await prisma.archiveLink.deleteMany({ where: { archiveFolderId: { in: ids } } });
    await prisma.archiveFolder.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.stagingSet.deleteMany({ where: { channelName: { startsWith: PREFIX } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.label.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

beforeEach(async () => {
  await cleanup();
  const label = await prisma.label.create({ data: { name: `${PREFIX} Nubiles` } });
  const other = await prisma.label.create({ data: { name: `${PREFIX} Elsewhere` } });
  ownCh = (await prisma.channel.create({
    data: { name: `${PREFIX} Nubiles`, shortName: "LSCA", labelId: label.id },
  })).id;
  siblingCh = (await prisma.channel.create({
    data: { name: `${PREFIX} NubileFilms`, shortName: "LSCF", labelId: label.id },
  })).id;
  strangerCh = (await prisma.channel.create({
    data: { name: `${PREFIX} Stranger`, shortName: "LSCX", labelId: other.id },
  })).id;
});

afterEach(cleanup);

/** A folder filed under the `LSCA` branch — the sibling's code, not the set's. */
function seedFolder() {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\LSCA-Nubiles\\2016-12-24-LSCA Gina - ${TITLE}`,
      folderName: `2016-12-24-LSCA Gina - ${TITLE}`,
      chanFolderName: "LSCA-Nubiles",
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
      parsedDate: DAY,
      parsedTitle: TITLE,
      parsedShortName: "LSCA",
    },
  });
}

function seedStaged(channelId: string, releaseDate = DAY) {
  return prisma.stagingSet.create({
    data: {
      title: TITLE,
      titleNorm: normalizeForSearch(TITLE),
      channelName: `${PREFIX} set`,
      channelId,
      releaseDate,
      isVideo: false,
    },
  });
}

describe("archive matching by owning Label", () => {
  it("set → folder: a NubileFilms set finds its folder under the Nubiles code", async () => {
    const folder = await seedFolder();
    const ss = await seedStaged(siblingCh);

    const res = await runMatchingPassForItem(ss.id, "staging", TENANT);

    expect(res.matched).toBe(true);
    const link = await prisma.archiveLink.findUnique({ where: { archiveFolderId: folder.id } });
    expect(link).toMatchObject({ stagingSetId: ss.id, status: "SUGGESTED" });
  });

  it("folder → set: the full pass suggests the same pair", async () => {
    const folder = await seedFolder();
    const ss = await seedStaged(siblingCh);

    await runMatchingPass(TENANT);

    const link = await prisma.archiveLink.findUnique({ where: { archiveFolderId: folder.id } });
    expect(link).toMatchObject({ stagingSetId: ss.id, status: "SUGGESTED" });
  });

  it("a sibling channel needs the exact day, not just a similar title", async () => {
    const folder = await seedFolder();
    const sibling = await seedStaged(siblingCh, new Date("2016-08-02T00:00:00.000Z"));
    const own = await seedStaged(ownCh, new Date("2016-08-02T00:00:00.000Z"));

    expect((await runMatchingPassForItem(sibling.id, "staging", TENANT)).matched,
      "same title, same year, other channel — a Label is too wide for that").toBe(false);
    expect((await runMatchingPassForItem(own.id, "staging", TENANT)).matched,
      "the folder's own channel keeps the title window").toBe(true);
    const link = await prisma.archiveLink.findUnique({ where: { archiveFolderId: folder.id } });
    expect(link?.stagingSetId).toBe(own.id);
  });

  it("does not reach across Labels", async () => {
    const folder = await seedFolder();
    const ss = await seedStaged(strangerCh);

    const res = await runMatchingPassForItem(ss.id, "staging", TENANT);

    expect(res.matched, "same day and title, different producer").toBe(false);
    expect(await prisma.archiveLink.findUnique({ where: { archiveFolderId: folder.id } })).toBeNull();
  });

  it("reports the sibling-coded folder as the one that is taken", async () => {
    const folder = await seedFolder();
    const holder = await seedStaged(ownCh);
    const ss = await seedStaged(siblingCh);
    await prisma.archiveLink.create({
      data: { archiveFolderId: folder.id, stagingSetId: holder.id, status: "CONFIRMED", tenant: TENANT },
    });

    const conflicts = await getConflictingLinks([ss.id]);

    expect(conflicts.get(ss.id)?.folderName).toBe(folder.folderName);
  });
});
