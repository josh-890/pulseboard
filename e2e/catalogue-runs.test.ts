import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// Catalogue runs (ADR-0038 S3): a run loaded through the agent API shows on the
// runs page with its problems, and Undo — after its preview — takes it back.
// Skips when dev already holds real catalogue runs (Undo is latest-run-first).

const db = new Client({ connectionString: process.env.DATABASE_URL });
const KEY = process.env.ARCHIVE_API_KEY ?? "";
const BASE = "http://localhost:3000";
const RUN = Date.now().toString(36).toUpperCase();
const ANNA = readFileSync(path.join(process.cwd(), "docs", "2026-02-22_Anna_Y_(AY-006S)"), "utf8");

const folder = (n: string, name: string, content?: string) => {
  const icg = `ZZ-91@${n}${RUN}`;
  const dir = `${name}_(${icg})`;
  return {
    path: `E2E|${dir}`,
    dirName: dir,
    importFiles: [{ name: `2026-02-22_${name}_(${icg})`, content: content ?? ANNA.replaceAll("AY-006S", icg).replace("CoverId     : 13850", `CoverId     : E2E-${n}${RUN}`) }],
    metaImages: [{ name: `${dir}.jpg`, size: 1 }],
    personImages: [],
    covers: 0,
    coverChecks: [],
    signature: "e2e",
  };
};

let backupBefore: string | null = null;
let skip = false;

test.describe.configure({ timeout: 90_000, mode: "serial" });

test.beforeAll(async () => {
  await db.connect();
  skip = Number((await db.query(`SELECT count(*) FROM catalogue_run WHERE status <> 'UNDONE'`)).rows[0].count) > 0;
  backupBefore = (await db.query(`SELECT value FROM "Setting" WHERE key = 'backup.lastAt'`)).rows[0]?.value ?? null;
  await db.query(
    `INSERT INTO "Setting" (key, value, "updatedAt") VALUES ('backup.lastAt', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [new Date().toISOString()],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM catalogue_folder WHERE path LIKE 'E2E|%'`);
  await db.query(`DELETE FROM catalogue_set WHERE "coverId" LIKE 'E2E-%'`);
  await db.query(`DELETE FROM "PersonRef" WHERE "icgId" LIKE 'ZZ-91@%'`);
  await db.query(`DELETE FROM catalogue_run WHERE counts->>'e2e' = 'true'`);
  if (backupBefore) await db.query(`UPDATE "Setting" SET value = $1 WHERE key = 'backup.lastAt'`, [backupBefore]);
  else await db.query(`DELETE FROM "Setting" WHERE key = 'backup.lastAt'`);
  await db.end();
});

async function post(route: string, body: unknown) {
  const res = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-archive-key": KEY },
    body: JSON.stringify(body),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  return res.json();
}

test("a run shows with its problems, and Undo takes it back after its preview", async ({ page }) => {
  test.skip(skip || !KEY, "dev holds real catalogue runs, or no ARCHIVE_API_KEY");
  const good = folder("A", "Alma_E2E");
  const empty = folder("B", "Empty_E2E", "");
  const { runId } = await post("/api/catalogue/load/runs", {
    folders: [good, empty].map((f) => ({ path: f.path, dirIcgId: f.dirName.match(/\(([^)]+)\)$/)![1] })),
  });
  await db.query(`UPDATE catalogue_run SET counts = counts || '{"e2e": true}' WHERE id = $1`, [runId]);
  await post(`/api/catalogue/load/runs/${runId}/folders`, { folders: [good, empty] });
  await post(`/api/catalogue/load/runs/${runId}/finish`, { seenPaths: null });

  await page.goto("/people/contacts/runs");
  await expect(page.getByText("first load").first()).toBeVisible();
  await expect(page.getByText(/2 folders · 1 new/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Problems Q2" })).toContainText(empty.path);

  await page.getByRole("button", { name: "Undo run" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("1 Contact it created is removed");
  await dialog.getByRole("button", { name: "Undo run" }).click();
  await expect(page.getByText("undone").first()).toBeVisible({ timeout: 30_000 });

  const left = await db.query(`SELECT count(*)::int AS n FROM "PersonRef" WHERE "icgId" LIKE 'ZZ-91@%'`);
  expect(left.rows[0].n).toBe(0);
  const folders = await db.query(`SELECT count(*)::int AS n FROM catalogue_folder WHERE path LIKE 'E2E|%'`);
  expect(folders.rows[0].n).toBe(0);
});
