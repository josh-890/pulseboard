import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { normalizeForSearch } from "@/lib/normalize";
import {
  developContact,
  DevelopRefused,
  getDevelopNote,
  getPersonHint,
  listPersonHints,
  refreshPersonHints,
  reviewNewerFile,
  workOutPersonHint,
} from "@/lib/services/catalogue-develop-service";
import { adoptPortraitAsHeadshot, contactCarryOver } from "@/lib/services/contact-service";
import { createPersonRecord, deletePersonRecord } from "@/lib/services/person-service";
import { getHeadshotsForPersons } from "@/lib/services/media-service";

// ADR-0038 S6 on the DEV database and MinIO: Develop reads the stored catalogue
// file instead of an upload; a developed Person's newer file is a hint only.
// Throwaway rows use ICG-IDs ZZ-92@…, folders ZDEV|…, objects catalogue/test-dev/…

const ANNA = readFileSync(path.join(process.cwd(), "docs", "2026-02-22_Anna_Y_(AY-006S)"), "utf8");
const ICG = (n: string) => `ZZ-92@${n}`;
const fileOf = (icg: string, name: string, cover: string) =>
  ANNA.replaceAll("AY-006S", icg).replaceAll("Anna Y", name).replace("CoverId     : 13850", `CoverId     : ${cover}`);
const keys: string[] = [];

async function storeFolder(n: string, name: string, cover: string, kind: "contact" | "person" = "contact") {
  const icg = ICG(n);
  const fileName = `2026-02-22_${name.replace(/ /g, "_")}_(${icg})`;
  const key = `catalogue/test-dev/${n}/${fileName}.gz`;
  await minioClient.send(
    new PutObjectCommand({ Bucket: getMinioBucket(), Key: key, Body: gzipSync(fileOf(icg, name, cover)), ContentType: "application/gzip" }),
  );
  keys.push(key);
  await prisma.catalogueFolder.create({
    data: {
      path: `ZDEV|${n}`, icgId: icg, name, kind, signature: "s", newestFile: fileName,
      newestDate: new Date("2026-02-22"), fileKey: key, firstRunId: "test", lastRunId: "test",
    },
  });
  return { icg, fileName };
}

afterEach(async () => {
  const batches = await prisma.importBatch.findMany({ where: { subjectIcgId: { startsWith: "ZZ-92@" } }, select: { id: true } });
  await prisma.importBatch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
  const persons = await prisma.person.findMany({ where: { icgId: { startsWith: "ZZ-92@" } }, select: { id: true } });
  for (const p of persons) {
    // Its images live in MinIO: removed with the rest
    for (const v of await deletePersonRecord(p.id)) keys.push(...Object.values(v).filter((k): k is string => typeof k === "string"));
  }
  await prisma.contact.deleteMany({ where: { icgId: { startsWith: "ZZ-92@" } } });
  await prisma.catalogueFolder.deleteMany({ where: { path: { startsWith: "ZDEV|" } } });
  if (keys.length) {
    await minioClient.send(new DeleteObjectsCommand({ Bucket: getMinioBucket(), Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    keys.length = 0;
  }
});

describe("Develop a Contact", () => {
  it("builds the import batch from her stored file — no upload — and says what carries over", async () => {
    const { icg, fileName } = await storeFolder("AAA", "Dora D", "DEV-TEST-1");
    const contact = await prisma.contact.create({
      data: { icgId: icg, name: "Dora (mine)", nameNorm: normalizeForSearch("Dora (mine)"), nameSetByUser: true, catalogueName: "Dora D" },
    });

    const { batchId } = await developContact(contact.id);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: { select: { type: true } } } });
    expect(batch).toMatchObject({ filename: fileName, subjectIcgId: icg });
    expect(batch.items.some((i) => i.type === "PERSON")).toBe(true);

    expect(await getDevelopNote(icg)).toEqual({ creditedSets: 0, nameKept: "Dora (mine)", portraitKept: false });
    expect(await contactCarryOver(icg)).toEqual({ name: "Dora (mine)", portraitKey: null });
  });

  it("is refused without a stored file or when she is a Person already", async () => {
    const bare = await prisma.contact.create({ data: { icgId: ICG("BBB"), name: "Bare" } });
    await expect(developContact(bare.id)).rejects.toThrow(DevelopRefused);
  });
});

describe("the portrait you chose", () => {
  it("becomes the Person's headshot", async () => {
    const key = `catalogue/test-dev/portrait-${Date.now()}.jpg`;
    const jpeg = await sharp({ create: { width: 256, height: 384, channels: 3, background: "#a0522d" } }).jpeg().toBuffer();
    await minioClient.send(new PutObjectCommand({ Bucket: getMinioBucket(), Key: key, Body: jpeg, ContentType: "image/jpeg" }));
    keys.push(key);
    const person = await createPersonRecord({ icgId: ICG("PPP"), idOrigin: "external", commonName: "Pia P" });

    await adoptPortraitAsHeadshot(person.id, key);
    const avatar = (await getHeadshotsForPersons([person.id])).get(person.id);
    expect(avatar?.url).toBeTruthy();
  });
});

describe("the Person hint", () => {
  it("a newer file names its new sets; once you imported that date or later, the hint is gone", async () => {
    const { icg } = await storeFolder("CCC", "Cara C", "DEV-TEST-2", "person");
    await createPersonRecord({ icgId: icg, idOrigin: "external", commonName: "Cara C" });

    // Never imported from a file: everything in it is news
    const hint = await workOutPersonHint(icg, { name: `2026-02-22_Cara_C_(${icg})`, content: fileOf(icg, "Cara C", "DEV-TEST-2") });
    expect(hint).toMatchObject({ fileDate: "2026-02-22", importedDate: null, newSets: 1 });

    await refreshPersonHints();
    expect(await getPersonHint(icg)).toMatchObject({ newSets: 1 });
    expect((await listPersonHints()).some((r) => r.icgId === icg)).toBe(true);

    // Review opens the import from the stored file; the hint is done
    const { batchId } = await reviewNewerFile((await prisma.person.findUniqueOrThrow({ where: { icgId: icg } })).id);
    expect(await prisma.importBatch.findUnique({ where: { id: batchId } })).not.toBeNull();
    expect(await getPersonHint(icg)).toBeNull();

    // A file not newer than what you imported brings no hint (your own corrections are not "changes")
    const same = await workOutPersonHint(icg, { name: `2026-02-22_Cara_C_(${icg})`, content: fileOf(icg, "Cara C", "DEV-TEST-2") });
    expect(same).toBeNull();
  });
});
