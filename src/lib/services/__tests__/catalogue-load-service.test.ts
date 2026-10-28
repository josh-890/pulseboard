import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  BACKUP_SETTING,
  finishRun,
  previewUndo,
  processFolders,
  startRun,
  undoRun,
} from "@/lib/services/catalogue-load-service";
import { renameContact, upsertImportedContact } from "@/lib/services/contact-service";
import type { LoadFolderInput } from "@/lib/services/catalogue-load";

// ADR-0038 S3 end to end on the DEV database: a run loads folders, enriches a
// thin Contact, marks a gone folder, and Undo puts everything back — keeping
// what the user worked with. Throwaway rows use ICG-IDs ZZ-93@… and are wiped.

const ANNA = readFileSync(path.join(process.cwd(), "docs", "2026-02-22_Anna_Y_(AY-006S)"), "utf8");
const file = (icg: string, name: string, cover: string) =>
  ANNA.replaceAll("AY-006S", icg).replaceAll("Anna Y", name).replace("CoverId     : 13850", `CoverId     : ${cover}`);

const ICG = (n: string) => `ZZ-93@${n}`;
const folder = (n: string, name: string, cover: string, signature = "s1"): LoadFolderInput => {
  const icg = ICG(n);
  const dir = `${name.replace(/ /g, "_")}_(${icg})`;
  return {
    path: `ZLST|${dir}`,
    dirName: dir,
    importFiles: [{ name: `2026-02-22_${name.replace(/ /g, "_")}_(${icg})`, content: file(icg, name, cover) }],
    metaImages: [{ name: `${dir}.jpg`, size: 1 }],
    personImages: [],
    covers: 0,
    coverChecks: [],
    signature,
  };
};

let backupBefore: string | null = null;

beforeEach(async () => {
  backupBefore = (await prisma.setting.findUnique({ where: { key: BACKUP_SETTING } }))?.value ?? null;
  await prisma.setting.upsert({
    where: { key: BACKUP_SETTING },
    create: { key: BACKUP_SETTING, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
});

afterEach(async () => {
  await prisma.catalogueSet.deleteMany({ where: { coverId: { startsWith: "LST-TEST" } } });
  await prisma.contact.deleteMany({ where: { icgId: { startsWith: "ZZ-93@" } } });
  await prisma.catalogueFolder.deleteMany({ where: { path: { startsWith: "ZLST|" } } });
  await prisma.catalogueRun.deleteMany({ where: { counts: { path: ["test"], equals: true } } });
  if (backupBefore) await prisma.setting.update({ where: { key: BACKUP_SETTING }, data: { value: backupBefore } });
  else await prisma.setting.deleteMany({ where: { key: BACKUP_SETTING } });
});

async function run(folders: LoadFolderInput[], seen: string[]) {
  const started = await startRun({ all: false, folders: folders.map((f) => ({ path: f.path, dirIcgId: f.dirName.match(/\(([^)]+)\)$/)![1] })) });
  await prisma.catalogueRun.update({ where: { id: started.runId }, data: { counts: { test: true } } });
  const results = await processFolders(started.runId, folders);
  const counts = await finishRun(started.runId, seen);
  return { ...started, results, counts };
}

describe("a catalogue run", () => {
  it("loads, enriches, marks gone — and Undo puts it back, keeping your work", async () => {
    // Before: a thin Contact from an import, one you renamed, and an earlier folder
    const thin = await upsertImportedContact(prisma, { icgId: ICG("BBB"), name: "B listed" });
    const named = await upsertImportedContact(prisma, { icgId: ICG("CCC"), name: "C listed" });
    await renameContact(named.id, "Cleo (mine)");

    const a = folder("AAA", "Alma A", "LST-TEST-1");
    const b = folder("BBB", "Bea B", "LST-TEST-2");
    const c = folder("CCC", "Cleo C", "LST-TEST-3");
    const first = await run([a, b, c], [a.path, b.path, c.path]);
    if (first.mode !== "first") {
      // dev already holds real runs: this test must not undo them
      return;
    }
    expect(first.results.map((r) => r.outcome)).toEqual(["new", "enriched", "enriched"]);

    const alma = await prisma.contact.findUniqueOrThrow({ where: { icgId: ICG("AAA") }, include: { channelAliases: true } });
    expect(alma).toMatchObject({ name: "Alma A", catalogueName: "Alma A", catalogueRunId: first.runId });
    expect(alma.channelAliases.map((x) => x.channelName)).toEqual(["METART"]);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: thin.id } })).name).toBe("Bea B"); // her own file decides
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: named.id } })).name).toBe("Cleo (mine)"); // yours sticks
    expect(await prisma.catalogueSet.count({ where: { coverId: { startsWith: "LST-TEST" } } })).toBe(3);

    // Second run: only Alma changed; Bea's folder is gone
    const a2 = folder("AAA", "Alma A", "LST-TEST-4", "s2");
    const second = await run([a2], [a2.path, c.path]);
    expect(second.mode).toBe("changes");
    expect(second.known[a.path]).toBe("s1");
    expect(second.counts.gone).toBe(1);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: thin.id } })).goneFromCatalogueAt).not.toBeNull();

    // Undo the second, then the first
    await expect(previewUndo(first.runId)).rejects.toThrow(/latest run/);
    await undoRun(second.runId);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: thin.id } })).goneFromCatalogueAt).toBeNull();
    expect(await prisma.catalogueSet.findUnique({ where: { coverId: "LST-TEST-4" } })).toBeNull();

    // You worked with Alma meanwhile: she stays, only her catalogue fields go
    await prisma.contact.update({ where: { id: alma.id }, data: { note: "keep her" } });
    const preview = await previewUndo(first.runId);
    expect(preview).toMatchObject({ contactsKept: 1, contactsRemoved: 0, contactsRestored: 2, setsRemoved: 3 });
    await undoRun(first.runId);
    const kept = await prisma.contact.findUniqueOrThrow({ where: { id: alma.id }, include: { channelAliases: true } });
    expect(kept).toMatchObject({ note: "keep her", catalogueName: null, catalogueRunId: null });
    expect(kept.channelAliases).toEqual([]);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: thin.id } })).name).toBe("B listed");
    expect(await prisma.catalogueFolder.count({ where: { path: { startsWith: "ZLST|" } } })).toBe(0);
  });

  it("the first load is refused without a fresh backup", async () => {
    if ((await prisma.catalogueRun.count({ where: { status: { in: ["DONE", "FAILED"] } } })) > 0) return;
    await prisma.setting.update({ where: { key: BACKUP_SETTING }, data: { value: "2020-01-01T00:00:00.000Z" } });
    await expect(startRun({ all: false, folders: [] })).rejects.toThrow(/backup/);
  });
});
