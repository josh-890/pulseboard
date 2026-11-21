import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { countArchiveStubs, getArchiveStubs } from "@/lib/services/archive-stub-service";
import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import { buildSetWhere } from "@/lib/services/set-service";
import { escapeLike } from "@/lib/prisma-like";
import type { TaggableEntity } from "@/lib/tag-domains";

// The Stubs view, the /sets Archive: Stub filter and archive:stub (ADR-0032 §7),
// against the DEV database; throwaway rows carry RUN and are removed afterwards.
const RUN = `stubview${Date.now().toString(36)}`;
const HOUR = 60 * 60 * 1000;

const ids = { touched: "", quiet: "", plain: "", setTouched: "", setQuiet: "", setPlain: "" };

async function folder(name: string, stubSince: Date | null, leafDirModifiedAt: Date | null, setId: string) {
  const f = await prisma.archiveFolder.create({
    data: {
      fullPath: `X:\\${RUN}\\${name}`,
      folderName: `${RUN} ${name}`,
      isVideo: false,
      scannedAt: new Date(),
      tenant: "test",
      fileCount: 40,
      stubSince,
      stubReason: stubSince ? "FEW_MEDIA" : null,
      leafDirModifiedAt,
    },
  });
  await prisma.archiveLink.create({ data: { archiveFolderId: f.id, setId, status: "CONFIRMED", tenant: "test" } });
  return f.id;
}

const match = async (entity: TaggableEntity, q: string, within: string[]) => {
  const f = await resolveTagFilterParam(q, entity);
  return (await findTagMatchIds(entity, f!.resolved, within)).sort();
};

beforeAll(async () => {
  for (const k of ["setTouched", "setQuiet", "setPlain"] as const) {
    ids[k] = (await prisma.set.create({ data: { type: "photo", title: `${RUN} ${k}` } })).id;
  }
  const marked = new Date(Date.now() - 10 * 24 * HOUR);
  // Files added three days after marking: the upgrade may be in
  ids.touched = await folder("touched", marked, new Date(marked.getTime() + 3 * 24 * HOUR), ids.setTouched);
  // Changed only minutes after marking — the scan writing .pb\STUB, not an upgrade
  ids.quiet = await folder("quiet", new Date(), new Date(Date.now() + 5 * 60 * 1000), ids.setQuiet);
  ids.plain = await folder("plain", null, new Date(), ids.setPlain);
});

afterAll(async () => {
  await prisma.archiveFolder.deleteMany({ where: { fullPath: { startsWith: escapeLike(`X:\\${RUN}`) } } });
  await prisma.set.deleteMany({ where: { title: { startsWith: RUN } } });
});

describe("getArchiveStubs", () => {
  it("lists stub folders only, those changed after marking first, with their set", async () => {
    const mine = (await getArchiveStubs()).filter((e) => e.folderName.startsWith(RUN));
    expect(mine.map((e) => e.id)).toEqual([ids.touched, ids.quiet]);
    expect(mine[0]).toMatchObject({
      touchedSinceStub: true,
      fileCount: 40,
      set: { id: ids.setTouched, photos: 0, hadMedia: false },
      stagingSet: null,
    });
    expect(mine[1]!.touchedSinceStub, "minutes after marking is the margin, not an upgrade").toBe(false);
  });

  it("counts them", async () => {
    expect(await countArchiveStubs()).toBeGreaterThanOrEqual(2);
  });
});

describe("Archive: Stub on /sets", () => {
  it("keeps the sets whose confirmed folder is a stub", async () => {
    const where = await buildSetWhere({
      archiveFilter: "stub",
      ids: [ids.setTouched, ids.setQuiet, ids.setPlain],
    });
    const got = (await prisma.set.findMany({ where, select: { id: true } })).map((s) => s.id).sort();
    expect(got).toEqual([ids.setTouched, ids.setQuiet].sort());
  });
});

describe("archive:stub", () => {
  it("sets and archive folders", async () => {
    expect(await match("SET", "archive:stub", [ids.setTouched, ids.setQuiet, ids.setPlain])).toEqual(
      [ids.setTouched, ids.setQuiet].sort(),
    );
    expect(await match("ARCHIVE_FOLDER", "archive:stub", [ids.touched, ids.plain])).toEqual([ids.touched]);
  });
});
