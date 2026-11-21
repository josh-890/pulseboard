import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The Stubs view and the stub filters (ADR-0032 §7): /archive/stubs lists stub
// folders (changed-since-marked first), End stub in the row takes one off;
// /sets finds stub sets through Archive: Stub and archive:stub.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SET_A = `e2e-set-stub-a-${RUN}`;
const SET_B = `e2e-set-stub-b-${RUN}`;
const F_A = `e2e-folder-stub-a-${RUN}`;
const F_B = `e2e-folder-stub-b-${RUN}`;
const TITLE = `Stub ${RUN}`;

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const [setId, folderId, k, sinceDays, changedDays] of [
    [SET_A, F_A, "a", 10, 2], // files changed after marking
    [SET_B, F_B, "b", 5, 5],
  ] as const) {
    await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [setId, `${TITLE} ${k}`]);
    await db.query(
      `INSERT INTO archive_folder (id, "fullPath", "folderName", "isVideo", "scannedAt", tenant, "fileCount", "stubSince", "stubReason", "leafDirModifiedAt", "archiveKey")
       VALUES ($1, $2, $3, false, now(), 'e2e', 80, now() - make_interval(days => $4), 'FEW_MEDIA', now() - make_interval(days => $5), gen_random_uuid()::text)`,
      [folderId, `X:\\e2e-stub-${RUN}\\${k}`, `e2e-stub-${RUN} ${k}`, sinceDays, changedDays],
    );
    await db.query(
      `INSERT INTO "ArchiveLink" (id, "archiveFolderId", "setId", status, tenant, "updatedAt") VALUES ($1, $2, $3, 'CONFIRMED', 'e2e', now())`,
      [`e2e-link-stub-${k}-${RUN}`, folderId, setId],
    );
  }
});

test.afterAll(async () => {
  await db.query(`DELETE FROM archive_folder WHERE id = ANY($1)`, [[F_A, F_B]]);
  await db.query(`DELETE FROM "Set" WHERE id = ANY($1)`, [[SET_A, SET_B]]);
  await db.end();
});

const row = (page: import("@playwright/test").Page, folderId: string) =>
  page.locator(`[data-testid="stub-row"][data-folder-id="${folderId}"]`);

test("/archive shows a Stubs tab that opens the list", async ({ page }) => {
  await page.goto("/archive");
  await page.getByTestId("archive-stubs-tab").click();
  await expect(page).toHaveURL(/\/archive\/stubs$/);
  await expect(row(page, F_A)).toBeVisible();
  await expect(row(page, F_B)).toBeVisible();
});

test("a folder changed after marking is flagged and comes first", async ({ page }) => {
  await page.goto("/archive/stubs");
  await expect(row(page, F_A)).toHaveAttribute("data-touched", "true");
  await expect(row(page, F_A)).toContainText("changed since marked");
  await expect(row(page, F_B)).toHaveAttribute("data-touched", "false");
  const ids = await page.locator('[data-testid="stub-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-folder-id")));
  expect(ids.indexOf(F_A)).toBeLessThan(ids.indexOf(F_B));
  await expect(row(page, F_A).getByTestId("stub-next-step")).toContainText("archive upload fills the set");

  await page.getByTestId("stubs-view-touched").click();
  await expect(row(page, F_A)).toBeVisible();
  await expect(row(page, F_B)).toHaveCount(0);
});

test("/sets finds stub sets — Archive: Stub and archive:stub", async ({ page }) => {
  await page.goto("/sets?type=all&archiveFilter=stub");
  await expect(page.locator(`a[href="/sets/${SET_A}"]`).first()).toBeVisible();
  await expect(page.locator(`a[href="/sets/${SET_B}"]`).first()).toBeVisible();

  await page.goto(`/sets?type=all&tags=${encodeURIComponent("archive:stub")}&q=${encodeURIComponent(TITLE)}`);
  await expect(page.locator(`a[href="/sets/${SET_A}"]`).first()).toBeVisible();
});

test("End stub in the row takes the folder off the list", async ({ page }) => {
  await page.goto("/archive/stubs");
  await row(page, F_B).getByRole("button", { name: "Edit or end stub" }).click();
  await page.getByRole("button", { name: "End stub…" }).click();
  await page.getByRole("button", { name: /real set/i }).click();
  await expect(row(page, F_B)).toHaveCount(0);
  await expect
    .poll(async () => (await db.query(`SELECT "stubSince" FROM archive_folder WHERE id = $1`, [F_B])).rows[0].stubSince)
    .toBeNull();

  await page.goto("/sets?type=all&archiveFilter=stub");
  await expect(page.locator(`a[href="/sets/${SET_A}"]`).first()).toBeVisible();
  await expect(page.locator(`a[href="/sets/${SET_B}"]`)).toHaveCount(0);
});
