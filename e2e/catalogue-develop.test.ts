import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Develop (ADR-0038 S6): a Contact whose catalogue file the last run stored is
// developed with one click — the import of that file opens, saying what carries
// over. Seeds a Contact, her catalogue folder and the gzip'd file in MinIO; all
// removed after (with the batch and the staged sets it made).

const db = new Client({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  endpoint: `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: "us-east-1",
  credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY!, secretAccessKey: process.env.MINIO_SECRET_KEY! },
  forcePathStyle: true,
});
const BUCKET = process.env.MINIO_BUCKET!;
const RUN = Date.now().toString(36).toUpperCase();
const ICG = `ZZ-91@${RUN}`;
const NAME = `Edda E${RUN}`;
const FILE = `2026-02-22_${NAME.replace(/ /g, "_")}_(${ICG})`;
const KEY = `catalogue/test-e2e/${RUN}/${FILE}.gz`;
const CONTACT_ID = `e2e-contact-develop-${RUN}`;

test.describe.configure({ timeout: 90_000, mode: "serial" });

test.beforeAll(async () => {
  await db.connect();
  const anna = readFileSync(path.join(process.cwd(), "docs", "2026-02-22_Anna_Y_(AY-006S)"), "utf8");
  const content = anna
    .replaceAll("AY-006S", ICG)
    .replaceAll("Anna Y", NAME)
    .replace("CoverId     : 13850", `CoverId     : E2E-DEV-${RUN}`);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: gzipSync(content), ContentType: "application/gzip" }));
  await db.query(
    `INSERT INTO "PersonRef" (id, "icgId", name, "nameNorm", "nameSetByUser", "catalogueName", "updatedAt")
     VALUES ($1, $2, 'Edda (mine)', 'edda (mine)', true, $3, now())`,
    [CONTACT_ID, ICG, NAME],
  );
  await db.query(
    `INSERT INTO catalogue_folder (path, "icgId", name, kind, signature, "newestFile", "newestDate", "fileKey", "firstRunId", "lastRunId", "updatedAt")
     VALUES ($1, $2, $3, 'contact', 's', $4, '2026-02-22', $5, 'test', 'test', now())`,
    [`ZE2E|${RUN}`, ICG, NAME, FILE, KEY],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM import_batch WHERE "subjectIcgId" = $1`, [ICG]);
  await db.query(`DELETE FROM catalogue_folder WHERE path = $1`, [`ZE2E|${RUN}`]);
  await db.query(`DELETE FROM "PersonRef" WHERE "icgId" = $1`, [ICG]);
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: KEY }));
  await db.end();
});

test("Develop opens the import of her stored catalogue file, saying your name stays", async ({ page }) => {
  await page.goto(`/people/contacts/${CONTACT_ID}`);
  await expect(page.getByRole("button", { name: "Add as Person" })).toHaveCount(0);
  await page.getByRole("button", { name: "Develop" }).click();

  await expect(page).toHaveURL(/\/import\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText("Developing a Contact.")).toBeVisible();
  await expect(page.getByText(/Your name “Edda \(mine\)” stays/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(NAME) })).toContainText(ICG);
});
