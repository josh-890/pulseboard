import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getArchiveKeyFolders } from "@/lib/services/archive-key-service";
import { archiveKeyDays, describeArchiveKeyDay } from "@/lib/archive-key";
import { normalizeForSearch } from "@/lib/normalize";
import { escapeLike } from "@/lib/prisma-like";

// The archive key popover (2026-10-25): the folders sharing a staged set's day
// and channel (Label siblings too), then ±2 days and day/month swapped.

describe("archiveKeyDays", () => {
  it("takes the day, two either side and the swap", () => {
    const days = archiveKeyDays(new Date("2017-10-05T00:00:00Z"));
    expect(days.map((d) => `${d.day}:${d.kind}:${d.offset}`)).toEqual([
      "2017-10-05:same:0",
      "2017-10-04:near:-1",
      "2017-10-06:near:1",
      "2017-10-03:near:-2",
      "2017-10-07:near:2",
      "2017-05-10:swapped:0",
    ]);
  });

  it("swaps only into a real, different date", () => {
    expect(archiveKeyDays(new Date("2017-10-25T00:00:00Z")).some((d) => d.kind === "swapped")).toBe(false);
    expect(archiveKeyDays(new Date("2017-03-03T00:00:00Z")).some((d) => d.kind === "swapped")).toBe(false);
    // 2017-01-02 ↔ 2017-02-01 lies outside ±2 days
    expect(archiveKeyDays(new Date("2017-01-02T00:00:00Z")).find((d) => d.kind === "swapped")?.day).toBe("2017-02-01");
  });

  it("says how far off a day is", () => {
    expect(describeArchiveKeyDay("same", 0)).toBe("");
    expect(describeArchiveKeyDay("near", 1)).toBe("+1 day");
    expect(describeArchiveKeyDay("near", -2)).toBe("−2 days");
    expect(describeArchiveKeyDay("swapped", 0)).toBe("day/month swapped");
  });
});

const PREFIX = "AKEY-TEST";
const TENANT = "akey-test";
const DAY = new Date("2017-10-05T00:00:00.000Z");
let own = "";

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
  const label = await prisma.label.create({ data: { name: `${PREFIX} MetArt` } });
  own = (await prisma.channel.create({ data: { name: `${PREFIX} MetArt`, shortName: "AKMA", labelId: label.id } })).id;
  await prisma.channel.create({ data: { name: `${PREFIX} MetArtX`, shortName: "AKMX", labelId: label.id } });
  await prisma.channel.create({ data: { name: `${PREFIX} Other`, shortName: "AKOT" } });
});

afterEach(cleanup);

function folder(day: string, code: string, person: string, title: string, isVideo = false) {
  const name = `${day}-${code} ${person} - ${title}`;
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${code}\\${name}${isVideo ? " v" : ""}`,
      folderName: name,
      isVideo,
      scannedAt: new Date(),
      tenant: TENANT,
      parsedDate: new Date(`${day}T00:00:00.000Z`),
      parsedTitle: title,
      parsedShortName: code,
    },
  });
}

describe("getArchiveKeyFolders", () => {
  it("lists the key's folders, agreement first, then the near misses — and their state", async () => {
    const ss = await prisma.stagingSet.create({
      data: {
        title: "Artica",
        titleNorm: normalizeForSearch("Artica"),
        channelName: `${PREFIX} set`,
        channelId: own,
        releaseDate: DAY,
        isVideo: false,
        participantNamesNorm: "nancy a",
      },
    });
    const other = await prisma.stagingSet.create({
      data: { title: "Chilea", channelName: `${PREFIX} set`, channelId: own, releaseDate: DAY, isVideo: false },
    });
    const wrong = await folder("2017-10-05", "AKMA", "Ginger Frost", "Chilea");
    const right = await folder("2017-10-05", "AKMA", "Nancy A", "Artica");
    await folder("2017-10-05", "AKMX", "Lena", "Sibling");
    await folder("2017-10-06", "AKMA", "Nancy A", "Artica Two");
    await folder("2017-05-10", "AKMA", "Mila", "Swapped");
    await folder("2017-10-09", "AKMA", "Far", "Away");
    await folder("2017-10-05", "AKOT", "Stranger", "Artica");
    await folder("2017-10-05", "AKMA", "Nancy A", "Artica", true);
    await prisma.archiveLink.create({
      data: { archiveFolderId: wrong.id, stagingSetId: ss.id, status: "SUGGESTED", confidence: "MEDIUM", tenant: TENANT },
    });
    await prisma.archiveLink.create({
      data: { archiveFolderId: right.id, stagingSetId: other.id, status: "SUGGESTED", confidence: "MEDIUM", tenant: TENANT },
    });

    const view = await getArchiveKeyFolders(ss.id, TENANT);
    expect(view.key).toBe("2017-10-05-AKMA");
    expect(view.hasConfirmed).toBe(false);
    expect(view.folders.map((f) => [f.folderName, f.kind, f.offset])).toEqual([
      ["2017-10-05-AKMA Nancy A - Artica", "same", 0],
      ["2017-10-05-AKMA Ginger Frost - Chilea", "same", 0],
      ["2017-10-05-AKMX Lena - Sibling", "same", 0],
      ["2017-10-06-AKMA Nancy A - Artica Two", "near", 1],
      ["2017-05-10-AKMA Mila - Swapped", "swapped", 0],
    ]);
    const [first, second] = view.folders;
    expect(first).toMatchObject({ personMatches: true, titleMatches: true, link: { state: "suggested", here: false, targetTitle: "Chilea" } });
    expect(second).toMatchObject({ personMatches: false, titleMatches: false, link: { state: "suggested", here: true, targetTitle: "Artica" } });
    expect(view.folders[2]!.link).toEqual({ state: "free" });
  });

  it("knows when the set already has its folder", async () => {
    const ss = await prisma.stagingSet.create({
      data: { title: "Numira", channelName: `${PREFIX} set`, channelId: own, releaseDate: DAY, isVideo: false },
    });
    const f = await folder("2017-10-05", "AKMA", "Nancy A", "Numira");
    await prisma.archiveLink.create({ data: { archiveFolderId: f.id, stagingSetId: ss.id, status: "CONFIRMED", tenant: TENANT } });
    const view = await getArchiveKeyFolders(ss.id, TENANT);
    expect(view.hasConfirmed).toBe(true);
    expect(view.folders[0]!.link).toMatchObject({ state: "confirmed", here: true });
  });

  it("has nothing to look up without a date or a channel code", async () => {
    const ss = await prisma.stagingSet.create({ data: { title: "Undated", channelName: `${PREFIX} set`, channelId: own, isVideo: false } });
    expect(await getArchiveKeyFolders(ss.id, TENANT)).toEqual({ key: null, hasConfirmed: false, folders: [] });
  });
});
