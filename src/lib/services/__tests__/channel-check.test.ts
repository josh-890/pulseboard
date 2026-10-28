import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBatch } from "@/lib/services/import/staging-service";
import { matchChannel, CHANNEL_NAME_SUGGESTION_CONFIDENCE } from "@/lib/services/import/matcher";
import {
  addChannelImportAlias,
  ImportAliasTakenError,
  removeChannelImportAlias,
} from "@/lib/services/channel-service";
import {
  channelHintsForFolder,
  getNameOnlyLinks,
  getUnclaimedArchiveFolders,
  rejectNameOnlyLink,
} from "@/lib/services/channel-check-service";

// ADR-0038, channels: a channel name links to a channel ONLY through an import
// alias the user set. A same name is a suggestion, a similar name is nothing.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway data is
// prefixed and wiped in afterEach.

const PREFIX = "CHK-TEST";
const TENANT = "test";

afterEach(async () => {
  await prisma.archiveFolder.deleteMany({ where: { folderName: { startsWith: PREFIX } } });
  await prisma.stagingSet.deleteMany({ where: { title: { startsWith: PREFIX } } });
  const batches = await prisma.importBatch.findMany({ where: { filename: { startsWith: PREFIX } }, select: { id: true } });
  if (batches.length) {
    const ids = batches.map((b) => b.id);
    await prisma.importItem.deleteMany({ where: { batchId: { in: ids } } });
    await prisma.importBatch.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.contact.deleteMany({ where: { icgId: { startsWith: "ZZ-96@" } } });
  await prisma.channel.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

const channel = (name: string, importAliases: string[] = [], extra: { shortName?: string; channelFolder?: string } = {}) =>
  prisma.channel.create({ data: { name, nameNorm: name.toLowerCase(), importAliases, ...extra } });

const staged = (title: string, channelName: string, channelId: string | null, status: "PENDING" | "PROMOTED" = "PENDING") =>
  prisma.stagingSet.create({
    data: { title: `${PREFIX} ${title}`, channelName, channelId, status, isVideo: false, participants: [], participantIcgIds: [] },
  });

describe("matching a channel name", () => {
  it("an import alias links; the same name is only a suggestion; a similar name is nothing", async () => {
    const c = await channel(`${PREFIX} Skeet`, [`${PREFIX} SKEET IMPORT`]);
    expect(await matchChannel(`${PREFIX} SKEET IMPORT`)).toMatchObject({ matchedEntityId: c.id, matchConfidence: 1.0 });
    expect(await matchChannel(`${PREFIX} SKEET`)).toMatchObject({
      matchedEntityId: c.id,
      matchConfidence: CHANNEL_NAME_SUGGESTION_CONFIDENCE,
    });
    expect((await matchChannel(`${PREFIX} SKEET EXTRAS`)).matchedEntityId).toBeNull();
  });

  it("an import file naming a channel by its name alone: the item waits, the staged set takes no channel", async () => {
    await channel(`${PREFIX} Chan`);
    const file = `URL: https://example.invalid/x
Name (extrahiert): ${PREFIX} Subject
Slug: chk-test-subject
ICGID : ZZ-96@SUB

=== Links aus 'Other Links' ===

Titeltxt : ${PREFIX} A Title
Covertitle : ${PREFIX} A Title
CoverId : ${PREFIX}-ext-1
Channel : ${PREFIX} Chan
Date : 2012-03-04
Video : false
ModelsCount : 1
ModelsList : Anna_(ZZ-96@AAA)[https://example.invalid/a]
`;
    const batch = await createBatch(`${PREFIX}-subject.txt`, file);
    const item = await prisma.importItem.findFirstOrThrow({ where: { batchId: batch.id, type: "CHANNEL" } });
    expect(item.status).toBe("PROBABLE");
    const set = await prisma.stagingSet.findFirstOrThrow({ where: { importBatchId: batch.id } });
    expect(set.channelId).toBeNull();
  });
});

describe("the import alias is the link", () => {
  it("adding it connects waiting open staged sets under that name; removing it disconnects them", async () => {
    const c = await channel(`${PREFIX} Femjoy`);
    const open = await staged("open", `${PREFIX} FEMJOY`, null);
    const promoted = await staged("done", `${PREFIX} FEMJOY`, null, "PROMOTED");

    expect(await addChannelImportAlias(c.id, `${PREFIX} FEMJOY`)).toEqual({ connected: 1 });
    expect((await prisma.stagingSet.findUniqueOrThrow({ where: { id: open.id } })).channelId).toBe(c.id);
    expect((await prisma.stagingSet.findUniqueOrThrow({ where: { id: promoted.id } })).channelId).toBeNull();

    expect(await removeChannelImportAlias(c.id, `${PREFIX} FEMJOY`)).toEqual({ disconnected: 1 });
    expect((await prisma.stagingSet.findUniqueOrThrow({ where: { id: open.id } })).channelId).toBeNull();
  });

  it("one name belongs to one channel", async () => {
    await channel(`${PREFIX} One`, [`${PREFIX} SHARED`]);
    const two = await channel(`${PREFIX} Two`);
    await expect(addChannelImportAlias(two.id, `${PREFIX} shared`)).rejects.toBeInstanceOf(ImportAliasTakenError);
  });
});

describe("the channel check", () => {
  it("lists a name linked by name only until it is anchored, and 'Not this one' disconnects", async () => {
    const c = await channel(`${PREFIX} MetArt`);
    await staged("a", `${PREFIX} METART`, c.id);
    await staged("b", `${PREFIX} METART`, c.id, "PROMOTED");

    const listed = (await getNameOnlyLinks()).filter((l) => l.channelId === c.id);
    expect(listed).toEqual([
      { channelName: `${PREFIX} METART`, channelId: c.id, appName: `${PREFIX} MetArt`, stagedSets: 2, openStagedSets: 1 },
    ]);

    expect(await rejectNameOnlyLink(c.id, `${PREFIX} METART`)).toEqual({ disconnected: 1 });
    await addChannelImportAlias(c.id, `${PREFIX} METART`);
    expect((await getNameOnlyLinks()).filter((l) => l.channelId === c.id)).toEqual([]);
  });

  it("an archive channel folder no channel claims is listed with hints; a claimed one is not", async () => {
    // Folder names are `Shortname-Channelname`: the marker must not hold a dash
    const F = "CHKTEST";
    await channel(`${PREFIX} Claimed`, [], { channelFolder: `${F}C-Claimed` });
    const hinted = await channel(`${PREFIX} ShowyBeauty`, [], { shortName: `${F}SB`, channelFolder: `${F}SB-Showybeauty` });
    for (const [name, chan] of [
      ["one", `${F}SB-ShowyBeauty`],
      ["two", `${F}SB-ShowyBeauty`],
      ["three", `${F}C-Claimed`],
    ]) {
      await prisma.archiveFolder.create({
        data: { fullPath: `X:\\${PREFIX}\\${name}`, folderName: `${PREFIX} ${name}`, isVideo: false, scannedAt: new Date(), tenant: TENANT, chanFolderName: chan },
      });
    }
    const mine = (await getUnclaimedArchiveFolders()).filter((f) => f.chanFolderName.startsWith(F));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ chanFolderName: `${F}SB-ShowyBeauty`, folders: 2 });
    expect(mine[0].hints.map((h) => h.id)).toEqual([hinted.id]);
  });

  it("hints come from the folder's Shortname prefix or its name part", () => {
    const rows = [
      { id: "1", name: "ShowyBeauty", shortName: "SBX", channelFolder: null, label: null },
      { id: "2", name: "Other", shortName: "SB", channelFolder: "SB-Other", label: { name: "L" } },
      { id: "3", name: "Unrelated", shortName: "UN", channelFolder: null, label: null },
    ];
    expect(channelHintsForFolder("SB-ShowyBeauty", rows).map((h) => [h.id, h.by])).toEqual([
      ["2", "shortName"],
      ["1", "name"],
    ]);
  });
});
