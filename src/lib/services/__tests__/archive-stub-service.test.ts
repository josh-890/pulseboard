import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  dismissStubEnded,
  endArchiveFolderStub,
  getStubWrites,
  markArchiveFolderStub,
  reconcileStubsFromScan,
} from "@/lib/services/archive-stub-service";
import { escapeLike } from "@/lib/prisma-like";

// Stub archive folders (ADR-0032): marking, re-describing and ending.
//
// Runs against the DEV database (vitest.config.ts loads .env); throwaway folders
// are keyed on fullPath and wiped in afterEach.

const PREFIX = "STUB-TEST";

afterEach(async () => {
  await prisma.archiveFolder.deleteMany({ where: { fullPath: { startsWith: escapeLike(`X:\\${PREFIX}`) } } });
});

function seedFolder(name: string, coverKey: string | null = null) {
  return prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${PREFIX}\\${name}`,
      folderName: name,
      isVideo: false,
      scannedAt: new Date(),
      tenant: "test",
      coverKey,
    },
  });
}

const read = (id: string) =>
  prisma.archiveFolder.findUniqueOrThrow({
    where: { id },
    select: { stubSince: true, stubReason: true, stubNote: true, stubEndedAt: true, stubDiskState: true, coverKey: true },
  });

describe("markArchiveFolderStub", () => {
  it("marks a folder with a reason and a trimmed note", async () => {
    const f = await seedFolder("mark");
    await markArchiveFolderStub(f.id, { reason: "FEW_MEDIA", note: "  12 of 80  " });
    const r = await read(f.id);
    expect(r.stubSince).toBeInstanceOf(Date);
    expect(r).toMatchObject({ stubReason: "FEW_MEDIA", stubNote: "12 of 80" });
  });

  it("re-describing keeps the original date; an empty note is no note", async () => {
    const f = await seedFolder("edit");
    await markArchiveFolderStub(f.id, { reason: "FEW_MEDIA", note: "x" });
    const since = (await read(f.id)).stubSince;
    await markArchiveFolderStub(f.id, { reason: "BOTH", note: "   " });
    const r = await read(f.id);
    expect(r.stubSince?.getTime(), "a stub is as old as its first mark").toBe(since?.getTime());
    expect(r).toMatchObject({ stubReason: "BOTH", stubNote: null });
  });
});

describe("endArchiveFolderStub", () => {
  it("clears the stub, records the end and resets the folder cover", async () => {
    const f = await seedFolder("end", `archive/${PREFIX}/cover-1.jpg`);
    await markArchiveFolderStub(f.id, { reason: "LOW_QUALITY" });
    await endArchiveFolderStub(f.id);
    const r = await read(f.id);
    expect(r).toMatchObject({ stubSince: null, stubReason: null, stubNote: null, coverKey: null });
    expect(r.stubEndedAt, "raises the re-import offer").toBeInstanceOf(Date);

    await dismissStubEnded(f.id);
    expect((await read(f.id)).stubEndedAt).toBeNull();
  });

  it("is a no-op on a folder that is not a stub", async () => {
    const f = await seedFolder("plain", `archive/${PREFIX}/cover-2.jpg`);
    await endArchiveFolderStub(f.id);
    const r = await read(f.id);
    expect(r.stubEndedAt).toBeNull();
    expect(r.coverKey, "a normal folder keeps its cover").toBe(`archive/${PREFIX}/cover-2.jpg`);
  });
});

describe("the disk side (reconcileStubsFromScan + getStubWrites)", () => {
  const ours = async () => (await getStubWrites()).filter((w) => w.fullPath.startsWith(`X:\\${PREFIX}`));

  it("STUB dropped on disk makes a stub — reason open, note from the file", async () => {
    const f = await seedFolder("disk-mark");
    const counts = await reconcileStubsFromScan([{ fullPath: f.fullPath, stubOnDisk: true, stubNote: " 12 of 80 " }]);
    expect(counts).toMatchObject({ markedFromDisk: 1, toWrite: 0 });
    const r = await read(f.id);
    expect(r.stubSince).toBeInstanceOf(Date);
    expect(r).toMatchObject({ stubReason: null, stubNote: "12 of 80", stubDiskState: true });
    expect(await ours(), "the disk already holds it").toEqual([]);
  });

  it("ended in the app → the agent is asked to remove STUB, then the next scan settles", async () => {
    const f = await seedFolder("app-end");
    await reconcileStubsFromScan([{ fullPath: f.fullPath, stubOnDisk: true }]);
    await endArchiveFolderStub(f.id);

    expect(await ours()).toEqual([{ fullPath: f.fullPath, want: false, note: null }]);

    // The agent removed the file; the next Full scan reports it gone.
    const counts = await reconcileStubsFromScan([{ fullPath: f.fullPath, stubOnDisk: false }]);
    expect(counts).toMatchObject({ markedFromDisk: 0, endedFromDisk: 0 });
    expect(await read(f.id)).toMatchObject({ stubSince: null, stubDiskState: false });
    expect(await ours()).toEqual([]);
  });

  it("STUB deleted on disk ends the stub — with the same consequences as the button", async () => {
    const f = await seedFolder("disk-end", `archive/${PREFIX}/cover-3.jpg`);
    await reconcileStubsFromScan([{ fullPath: f.fullPath, stubOnDisk: true }]);
    const counts = await reconcileStubsFromScan([{ fullPath: f.fullPath, stubOnDisk: false }]);
    expect(counts.endedFromDisk).toBe(1);
    const r = await read(f.id);
    expect(r).toMatchObject({ stubSince: null, coverKey: null, stubDiskState: false });
    expect(r.stubEndedAt).toBeInstanceOf(Date);
  });

  it("marked in the app before any scan saw the folder → the agent writes STUB with the note", async () => {
    const f = await seedFolder("app-first");
    await markArchiveFolderStub(f.id, { reason: "FEW_MEDIA", note: "12 of 80" });
    expect(await ours()).toEqual([{ fullPath: f.fullPath, want: true, note: "12 of 80" }]);
  });

  it("an item without stubOnDisk (targeted scan, older agent) changes nothing", async () => {
    const f = await seedFolder("not-looked");
    await markArchiveFolderStub(f.id, { reason: "BOTH" });
    await reconcileStubsFromScan([{ fullPath: f.fullPath }]);
    const r = await read(f.id);
    expect(r.stubSince, "not looked is not deleted").toBeInstanceOf(Date);
    expect(r.stubDiskState).toBeNull();
  });
});
