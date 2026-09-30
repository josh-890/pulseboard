import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  dismissStubEnded,
  endArchiveFolderStub,
  markArchiveFolderStub,
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
    select: { stubSince: true, stubReason: true, stubNote: true, stubEndedAt: true, coverKey: true },
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
