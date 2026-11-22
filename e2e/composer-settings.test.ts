import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Settings → Composer (ADR-0043, R4) and "+ value" in the workbench. Everything
// runs on a throwaway path of its own (two facets, a context facet, one photo);
// the user's vocabulary is only read.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const PATH = `E2E ${RUN}`;
const PATH_ID = `e2e-cpath-${RUN}`;
const SECTION_ID = `e2e-csec-${RUN}`;
const NAMED_SECTION_ID = `e2e-csec-named-${RUN}`;
const FACET = `E2E Facet ${RUN}`;
const FACET_ID = `e2e-cgroup-${RUN}`;
const NAMED = `E2E Named forms ${RUN}`;
const NAMED_ID = `e2e-cnamed-${RUN}`;
const SESSION = `e2e-session-cset-${RUN}`;
const SET = `e2e-set-cset-${RUN}`;
const PHOTO = `${SESSION}-1`;
const v = (k: string) => `e2e-${RUN}-${k}`;
const VALUES = ["a", "b", "c"];
const ADDED_FACET = `E2E Added ${RUN}`;

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeAll(async () => {
  await db.connect();
  for (const [id, name] of [
    [FACET_ID, FACET],
    [NAMED_ID, NAMED],
  ])
    await db.query(`INSERT INTO tag_group (id, name, slug) VALUES ($1, $2, $1)`, [id, name]);
  for (const [i, k] of VALUES.entries())
    await db.query(`INSERT INTO tag_definition (id, "groupId", name, slug, "nameNorm", "sortOrder") VALUES ($1, $2, $1, $1, $1, $3)`, [v(k), FACET_ID, i]);
  await db.query(`INSERT INTO composer_path (id, name, "sortOrder") VALUES ($1, $2, 999)`, [PATH_ID, PATH]);
  await db.query(`INSERT INTO composer_section (id, "pathId", name, "sortOrder") VALUES ($1, $2, 'Main', 0), ($3, $2, 'Named', 1)`, [
    SECTION_ID,
    PATH_ID,
    NAMED_SECTION_ID,
  ]);
  await db.query(`INSERT INTO composer_section_group ("sectionId", "groupId") VALUES ($1, $2), ($3, $4)`, [SECTION_ID, FACET_ID, NAMED_SECTION_ID, NAMED_ID]);
  await db.query(`INSERT INTO "Session" (id, name, "updatedAt") VALUES ($1, $2, now())`, [SESSION, `Compose settings ${RUN}`]);
  await db.query(`INSERT INTO "Set" (id, type, title, "updatedAt") VALUES ($1, 'photo', $2, now())`, [SET, `Compose settings ${RUN}`]);
  await db.query(`INSERT INTO "SetSession" ("setId", "sessionId", "isPrimary") VALUES ($1, $2, true)`, [SET, SESSION]);
  await db.query(
    `INSERT INTO "MediaItem" (id, "sessionId", "mediaType", filename, "mimeType", size, "originalWidth", "originalHeight", "fileRef", "updatedAt")
     VALUES ($1, $2, 'PHOTO', $3, 'image/jpeg', 1, 600, 900, 'e2e/none.jpg', now())`,
    [PHOTO, SESSION, `${PHOTO}.jpg`],
  );
  await db.query(`INSERT INTO "SetMediaItem" ("setId", "mediaItemId", "sortOrder") VALUES ($1, $2, 1)`, [SET, PHOTO]);
});

test.afterAll(async () => {
  const added = (await db.query<{ id: string }>(`SELECT id FROM tag_group WHERE name = $1`, [ADDED_FACET])).rows.map((r) => r.id);
  const ids = (await db.query<{ id: string }>(`SELECT id FROM tag_definition WHERE "groupId" = ANY($1)`, [[FACET_ID, NAMED_ID, ...added]])).rows.map((r) => r.id);
  await db.query(`DELETE FROM media_item_tag WHERE "mediaItemId" = $1`, [PHOTO]);
  await db.query(`DELETE FROM tag_relevance WHERE "contextTagId" = ANY($1) OR "targetId" = ANY($2)`, [ids, [...ids, FACET_ID, NAMED_ID, PATH_ID]]);
  await db.query(`DELETE FROM tag_confusable WHERE "tagAId" = ANY($1) OR "tagBId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM tag_extra_parent WHERE "tagId" = ANY($1) OR "parentId" = ANY($1)`, [ids]);
  await db.query(`DELETE FROM tag_alias WHERE "tagDefinitionId" = ANY($1)`, [ids]);
  await db.query(`UPDATE tag_definition SET "parentId" = NULL WHERE id = ANY($1)`, [ids]);
  await db.query(`DELETE FROM tag_definition WHERE id = ANY($1)`, [ids]);
  await db.query(`DELETE FROM composer_path WHERE id = $1`, [PATH_ID]);
  await db.query(`DELETE FROM tag_group WHERE id = ANY($1)`, [[FACET_ID, NAMED_ID, ...added]]);
  await db.query(`DELETE FROM "SetMediaItem" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "MediaItem" WHERE "sessionId" = $1`, [SESSION]);
  await db.query(`DELETE FROM "SetSession" WHERE "setId" = $1`, [SET]);
  await db.query(`DELETE FROM "Set" WHERE id = $1`, [SET]);
  await db.query(`DELETE FROM "Session" WHERE id = $1`, [SESSION]);
  await db.end();
});

const row = (page: Page, kind: string, name: string) => page.locator(`[data-testid="composer-tree-${kind}"][data-name="${name}"]`);
const select = (page: Page, kind: string, name: string) => row(page, kind, name).getByTestId("composer-tree-select").click();

/** Open the throwaway path down to its facet */
async function openFacet(page: Page) {
  await page.goto("/settings/catalogs/composer");
  await select(page, "path", PATH);
  await select(page, "section", "Main");
  await select(page, "facet", FACET);
  await expect(page.getByTestId("composer-panel-facet")).toBeVisible();
}

test("a facet's settings, a new value and the order of values", async ({ page }) => {
  await openFacet(page);
  await page.getByTestId("composer-facet-choice").getByRole("radio", { name: "One" }).click();
  await page.getByTestId("composer-facet-default").getByRole("radio", { name: "Waits" }).click();
  await expect(row(page, "facet", FACET)).toContainText("one");
  await expect(row(page, "facet", FACET)).toContainText("waits");
  const g = await db.query(`SELECT "composerChoice", "composerDefault" FROM tag_group WHERE id = $1`, [FACET_ID]);
  expect(g.rows[0]).toEqual({ composerChoice: "ONE", composerDefault: "IMPOSSIBLE" });

  await page.getByTestId("composer-add-value").fill(v("d"));
  await page.getByTestId("composer-add-value").press("Enter");
  await expect(page.getByTestId("composer-panel-value")).toBeVisible();
  await expect(page.getByTestId("composer-value-name")).toHaveValue(v("d"));

  // ↑ moves the selected value up among its siblings
  await row(page, "value", v("d")).getByRole("button", { name: `Move ${v("d")} up` }).click();
  await expect
    .poll(async () => (await db.query(`SELECT name FROM tag_definition WHERE "groupId" = $1 ORDER BY "sortOrder"`, [FACET_ID])).rows.map((r) => r.name))
    .toEqual([v("a"), v("b"), v("d"), v("c")]);
});

test("+ section and + facet in the tree; an empty section can go", async ({ page }) => {
  await page.goto("/settings/catalogs/composer");
  await select(page, "path", PATH);
  const sectionForm = page.getByTestId("composer-add-section");
  await sectionForm.getByRole("textbox").fill("Extra");
  await sectionForm.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("composer-panel-section")).toBeVisible();
  await expect(row(page, "section", "Extra")).toBeVisible();

  await page.getByRole("radio", { name: "One" }).click();
  const facetForm = page.getByTestId("composer-add-facet");
  await facetForm.getByRole("textbox").fill(ADDED_FACET);
  await facetForm.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("composer-panel-facet")).toBeVisible();
  await expect(row(page, "facet", ADDED_FACET)).toContainText("one");
  const g = await db.query(`SELECT domain, "composerChoice" FROM tag_group WHERE name = $1`, [ADDED_FACET]);
  expect(g.rows[0]).toEqual({ domain: "ANY", composerChoice: "ONE" }); // like the path's other facets (the fixture's are ANY)

  // Out of the section (the group stays), then the empty section goes
  await page.getByTestId("composer-detach-facet").click();
  await page.getByTestId("composer-detach-facet").click();
  await expect(page.getByTestId("composer-panel-section")).toBeVisible();
  await page.getByTestId("composer-delete-section").click();
  await expect(row(page, "section", "Extra")).toHaveCount(0);
  expect((await db.query(`SELECT count(*)::int AS n FROM tag_group WHERE name = $1`, [ADDED_FACET])).rows[0].n).toBe(1);
});

test("a value's relations: parents, look-alikes and a named form from parts", async ({ page }) => {
  await openFacet(page);
  await select(page, "value", v("c"));
  await page.getByTestId("composer-add-parent").fill(v("a"));
  await page.getByTestId("composer-picker-hit").first().click();
  await expect(page.getByTestId("composer-relations-parents").getByTestId("composer-relation-chip")).toHaveCount(1);
  expect((await db.query(`SELECT "parentId" FROM tag_definition WHERE id = $1`, [v("c")])).rows[0].parentId).toBe(v("a"));

  await page.getByTestId("composer-add-confusable").fill(v("b"));
  await page.getByTestId("composer-add-confusable").press("Enter");
  await expect(page.getByTestId("composer-relations-confusables").getByTestId("composer-relation-chip")).toHaveCount(1);

  await page.getByTestId("composer-form-part").fill(v("b"));
  await page.getByTestId("composer-form-part").press("Enter");
  await page.getByTestId("composer-form-name").fill(v("form"));
  await page.getByTestId("composer-new-form").getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("composer-value-name")).toHaveValue(v("form"));
  const form = await db.query(
    `SELECT t."groupId", t."parentId", array(SELECT "parentId" FROM tag_extra_parent WHERE "tagId" = t.id) AS extra FROM tag_definition t WHERE t.slug = $1`,
    [v("form")],
  );
  expect(form.rows[0]).toEqual({ groupId: NAMED_ID, parentId: v("c"), extra: [v("b")] });
});

test("the relevance matrix: a context column, a cell cycles and clears; the facet default cycles", async ({ page }) => {
  await openFacet(page);
  await page.getByRole("button", { name: "Relevance under each context" }).click();
  await expect(page.getByTestId(`composer-matrix-path-${PATH}`)).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("composer-matrix-add-context").fill(v("a"));
  await page.getByTestId("composer-matrix-add-context").press("Enter");
  await expect(page.locator(`[data-testid="composer-matrix-context"][data-tag="${v("a")}"]`)).toBeVisible();

  const cell = page.locator(`[data-testid="composer-matrix-row"][data-row="${NAMED}"]`).getByTestId("composer-relevance-cell").nth(1);
  const level = async () =>
    (await db.query(`SELECT level FROM tag_relevance WHERE "contextTagId" = $1 AND "targetKind" = 'GROUP' AND "targetId" = $2`, [v("a"), NAMED_ID])).rows[0]?.level ?? null;
  await cell.click();
  await expect(cell).toHaveAttribute("data-own", "TYPICAL");
  await expect.poll(level).toBe("TYPICAL");
  for (const want of ["POSSIBLE", "IMPOSSIBLE", ""]) {
    await cell.click();
    await expect(cell).toHaveAttribute("data-own", want);
  }
  await expect.poll(level).toBeNull();

  // The Default column: possible → waits → typical
  const def = page.locator(`[data-testid="composer-matrix-row"][data-row="${NAMED}"]`).getByTestId("composer-relevance-cell").first();
  await def.click();
  await expect(def).toHaveAttribute("data-own", "IMPOSSIBLE");
  await def.click();
  await expect(def).toHaveAttribute("data-own", "TYPICAL");
  expect((await db.query(`SELECT "composerDefault" FROM tag_group WHERE id = $1`, [NAMED_ID])).rows[0].composerDefault).toBe("TYPICAL");
});

test("+ value in the workbench adds to the facet and picks it", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem("composer.pinned"));
  await page.goto(`/sets/${SET}/compose`);
  await page.getByTestId(`composer-path-${PATH}`).click();
  // The first facet waits (set above); the named-forms facet is typical by default now
  const named = page.locator(`[data-testid="composer-facet"][data-facet="${NAMED}"]`);
  await expect(named).toBeVisible();
  await named.getByTestId("composer-facet-add").click();
  await named.getByTestId("composer-facet-add-input").fill(v("new"));
  await named.getByTestId("composer-facet-add-input").press("Enter");
  await expect(page.locator(`[data-testid="composer-tile"][data-tag="${v("new")}"]`)).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("composer-diff")).toContainText(`+ ${v("new")}`);
  expect((await db.query(`SELECT "groupId" FROM tag_definition WHERE slug = $1`, [v("new")])).rows[0]?.groupId).toBe(NAMED_ID);
});
