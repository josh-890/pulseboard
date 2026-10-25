import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { runMatchingPass } from "@/lib/services/archive-service";
import { normalizeForSearch } from "@/lib/normalize";
import { escapeLike } from "@/lib/prisma-like";

// A same-day folder that agrees on nothing but the day must give the set up to
// one that also agrees on the person or the title (2026-10-25).
//
// On xpulse `2017-10-05-MA Ginger Frost - Chilea` held the staged set *Artica*
// (Nancy A, same day, MEDIUM) and `2017-10-05-MA Nancy A - Artica` (HIGH) could
// not take it: the incumbent rule only looked at the day and confirmed persons,
// which were equal. The right folder went to another set, or to none.
//
// Runs against the DEV database. Codes and paths are unique to this file.

const PREFIX = "INCUMB-TEST";
const TENANT = "incumb-test";
const DAY = new Date("2017-10-05T00:00:00.000Z");

let channelId = "";

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
  await prisma.set.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

beforeEach(async () => {
  await cleanup();
  channelId = (await prisma.channel.create({ data: { name: `${PREFIX} MetArt`, shortName: "INCA" } })).id;
});

afterEach(cleanup);

function seedFolder(person: string, title: string) {
  const name = `2017-10-05-INCA ${person} - ${title}`;
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\INCA-MetArt\\2017\\${name}`,
      folderName: name,
      chanFolderName: "INCA-MetArt",
      isVideo: false,
      scannedAt: new Date(),
      tenant: TENANT,
      parsedDate: DAY,
      parsedTitle: title,
      parsedShortName: "INCA",
    },
  });
}

const linkOf = (folderId: string) => prisma.archiveLink.findUnique({ where: { archiveFolderId: folderId } });

describe("a same-day incumbent that agrees on nothing else", () => {
  it("gives a staged set up to the folder with the set's person", async () => {
    const artica = await prisma.stagingSet.create({
      data: {
        title: "Artica",
        titleNorm: normalizeForSearch("Artica"),
        channelName: `${PREFIX} set`,
        channelId,
        releaseDate: DAY,
        isVideo: false,
        participantNamesNorm: "nancy a",
      },
    });
    const wrong = await seedFolder("Ginger Frost", "Chilea");
    const right = await seedFolder("Nancy A", "Artica");
    // The wrong folder arrived first and holds the set on the day alone
    await prisma.archiveLink.create({
      data: { archiveFolderId: wrong.id, stagingSetId: artica.id, status: "SUGGESTED", confidence: "MEDIUM", tenant: TENANT },
    });

    await runMatchingPass(TENANT);

    expect(await linkOf(right.id)).toMatchObject({ stagingSetId: artica.id, status: "SUGGESTED", confidence: "HIGH" });
    expect((await linkOf(wrong.id))?.stagingSetId ?? null).not.toBe(artica.id);
  });

  it("keeps a HIGH incumbent against a challenger with only the day", async () => {
    const artica = await prisma.stagingSet.create({
      data: {
        title: "Artica",
        titleNorm: normalizeForSearch("Artica"),
        channelName: `${PREFIX} set`,
        channelId,
        releaseDate: DAY,
        isVideo: false,
        participantNamesNorm: "nancy a",
      },
    });
    const right = await seedFolder("Nancy A", "Artica");
    const wrong = await seedFolder("Ginger Frost", "Chilea");
    await prisma.archiveLink.create({
      data: { archiveFolderId: right.id, stagingSetId: artica.id, status: "SUGGESTED", confidence: "HIGH", tenant: TENANT },
    });

    await runMatchingPass(TENANT);

    expect(await linkOf(right.id)).toMatchObject({ stagingSetId: artica.id, confidence: "HIGH" });
    expect(await linkOf(wrong.id)).toBeNull();
  });

  it("gives another channel of the Label nothing on the day alone, and a set with the person", async () => {
    const label = await prisma.label.create({ data: { name: `${PREFIX} Label` } });
    await prisma.channel.update({ where: { id: channelId }, data: { labelId: label.id } });
    const sibling = await prisma.channel.create({ data: { name: `${PREFIX} GoddessNudes`, shortName: "INCG", labelId: label.id } });
    await prisma.stagingSet.create({
      data: { title: "Set 8", titleNorm: "set 8", channelName: `${PREFIX} set`, channelId: sibling.id, releaseDate: DAY, isVideo: false, participantNamesNorm: "lena" },
    });
    const nancy = await prisma.stagingSet.create({
      data: { title: "Elsewhere", titleNorm: "elsewhere", channelName: `${PREFIX} set`, channelId: sibling.id, releaseDate: DAY, isVideo: false, participantNamesNorm: "nancy a" },
    });
    const folder = await seedFolder("Nancy A", "Artica");

    try {
      await runMatchingPass(TENANT);
      // Not "Set 8": nothing but the day; the sibling's Nancy A set: the person agrees
      expect(await linkOf(folder.id)).toMatchObject({ stagingSetId: nancy.id, confidence: "HIGH" });
      await prisma.archiveLink.deleteMany({ where: { archiveFolderId: folder.id } });
      await prisma.stagingSet.delete({ where: { id: nancy.id } });
      await runMatchingPass(TENANT);
      expect(await linkOf(folder.id)).toBeNull();
    } finally {
      await prisma.archiveLink.deleteMany({ where: { archiveFolderId: folder.id } });
      await prisma.stagingSet.deleteMany({ where: { channelId: sibling.id } });
      await prisma.channel.delete({ where: { id: sibling.id } });
      await prisma.channel.update({ where: { id: channelId }, data: { labelId: null } });
      await prisma.label.delete({ where: { id: label.id } });
    }
  });

  it("drops a stored suggestion the current rules no longer make", async () => {
    const label = await prisma.label.create({ data: { name: `${PREFIX} Label2` } });
    await prisma.channel.update({ where: { id: channelId }, data: { labelId: label.id } });
    const sibling = await prisma.channel.create({ data: { name: `${PREFIX} Sibling2`, shortName: "INCH", labelId: label.id } });
    const set8 = await prisma.stagingSet.create({
      data: { title: "Set 8", titleNorm: "set 8", channelName: `${PREFIX} set`, channelId: sibling.id, releaseDate: DAY, isVideo: false, participantNamesNorm: "lena" },
    });
    const folder = await seedFolder("Nancy A", "Artica");
    // What the looser rule left: a sibling on the day alone
    await prisma.archiveLink.create({
      data: { archiveFolderId: folder.id, stagingSetId: set8.id, status: "SUGGESTED", confidence: "MEDIUM", tenant: TENANT },
    });
    try {
      const res = await runMatchingPass(TENANT);
      expect(await linkOf(folder.id)).toBeNull();
      expect(res.cleared).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.archiveLink.deleteMany({ where: { archiveFolderId: folder.id } });
      await prisma.stagingSet.deleteMany({ where: { channelId: sibling.id } });
      await prisma.channel.delete({ where: { id: sibling.id } });
      await prisma.channel.update({ where: { id: channelId }, data: { labelId: null } });
      await prisma.label.delete({ where: { id: label.id } });
    }
  });

  it("gives a promoted set up too — it used to skip any set another folder held", async () => {
    const set = await prisma.set.create({
      data: { title: `${PREFIX} Numira`, titleNorm: normalizeForSearch(`${PREFIX} Numira`), type: "photo", channelId, releaseDate: DAY },
    });
    const wrong = await seedFolder("Elsa", "Weidy");
    const right = await seedFolder("Nancy A", `${PREFIX} Numira`);
    await prisma.archiveLink.create({
      data: { archiveFolderId: wrong.id, setId: set.id, status: "SUGGESTED", confidence: "MEDIUM", tenant: TENANT },
    });

    await runMatchingPass(TENANT);

    expect(await linkOf(right.id)).toMatchObject({ setId: set.id, status: "SUGGESTED", confidence: "HIGH" });
    expect((await linkOf(wrong.id))?.setId ?? null).not.toBe(set.id);
  });
});
