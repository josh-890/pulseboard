import "dotenv/config";
import { test, expect } from "@playwright/test";
import { Client } from "pg";

// The Contact page and the Contact marking (ADR-0038, S2): a Contact is known,
// not developed — her page shows the lookup aids, a rename sticks, and a staged
// set's cast marks her as a Contact and links to her page. Seeds its own rows.

const db = new Client({ connectionString: process.env.DATABASE_URL });
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const ICG = `ZZ-94@${RUN.toUpperCase()}`;
const CONTACT = { id: `e2e-contact-cp-${RUN}`, name: `Test Sunny ${RUN}` };
const STAGED = { id: `e2e-ss-cp-${RUN}`, title: `Test staged cp ${RUN}` };

test.describe.configure({ timeout: 90_000, mode: "serial" });

test.beforeAll(async () => {
  await db.connect();
  await db.query(
    `INSERT INTO "PersonRef" (id, "icgId", name, "nameNorm", "catalogueName", "birthYear", nationality, "searchNorm", "updatedAt")
     VALUES ($1, $2, $3, lower($3), $3, 1998, 'UKR', lower($3 || ' ' || $2), now())`,
    [CONTACT.id, ICG, CONTACT.name],
  );
  await db.query(
    `INSERT INTO staging_set (id, title, "channelName", participants, "participantIcgIds", "updatedAt")
     VALUES ($1, $2, 'TEST CHANNEL', $3::jsonb, ARRAY[$4], now())`,
    [STAGED.id, STAGED.title, JSON.stringify([{ name: CONTACT.name, icgId: ICG }]), ICG],
  );
});

test.afterAll(async () => {
  await db.query(`DELETE FROM staging_set WHERE id = $1`, [STAGED.id]);
  await db.query(`DELETE FROM "PersonRef" WHERE id = $1`, [CONTACT.id]);
  await db.end();
});

test("her page: marked as a Contact, lookup aids, a rename that sticks, a note", async ({ page }) => {
  await page.goto(`/people/contacts/${CONTACT.id}`);
  await expect(page.getByText("Contact — not yet developed")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: CONTACT.name })).toBeVisible();
  await expect(page.getByText(`· UKR · 1998`)).toBeVisible();
  await expect(page.getByRole("region", { name: "In staged sets" })).toContainText(STAGED.title);

  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(`${CONTACT.name} blonde`);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${CONTACT.name} blonde` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Your name — her catalogue file says")).toBeVisible();
  let { rows } = await db.query(`SELECT name, "nameSetByUser" FROM "PersonRef" WHERE id = $1`, [CONTACT.id]);
  expect(rows[0]).toEqual({ name: `${CONTACT.name} blonde`, nameSetByUser: true });

  await page.getByRole("button", { name: "Use it" }).click();
  await expect(page.getByRole("heading", { level: 1, name: CONTACT.name })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("textbox", { name: "Note" }).fill("Seen at the 2019 casting");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved")).toBeVisible({ timeout: 30_000 });
  ({ rows } = await db.query(`SELECT note FROM "PersonRef" WHERE id = $1`, [CONTACT.id]));
  expect(rows[0].note).toBe("Seen at the 2019 casting");
});

test("the register links to her page and shows the lookup aids", async ({ page }) => {
  await page.goto(`/people/contacts?q=${encodeURIComponent(CONTACT.name)}`);
  const row = page.getByRole("listitem").filter({ hasText: ICG });
  await expect(row).toContainText("UKR · 1998");
  await row.getByRole("link", { name: CONTACT.name }).click();
  await expect(page).toHaveURL(new RegExp(`/people/contacts/${CONTACT.id}$`));
});

test("a staged set's cast marks her as a Contact and links to her page", async ({ page }) => {
  await page.goto(`/staging-sets?select=${STAGED.id}`);
  const member = page.getByRole("link", { name: new RegExp(`${CONTACT.name}.*Contact`) });
  await expect(member).toBeVisible({ timeout: 30_000 });
  await expect(member).toContainText("UKR · 1998");
  await expect(member).toHaveAttribute("href", `/people/contacts/${CONTACT.id}`);
});
