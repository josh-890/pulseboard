import { test, expect } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForToast(page: import("@playwright/test").Page, text: string) {
  await expect(page.locator(`[data-sonner-toast]`).filter({ hasText: text })).toBeVisible({
    timeout: 8000,
  });
}

// ── People ────────────────────────────────────────────────────────────────────

test.describe("People CRUD", () => {
  test("list page loads and has Add Person button", async ({ page }) => {
    await page.goto("/people");
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add person/i })).toBeVisible();
  });

  test("create person", async ({ page }) => {
    await page.goto("/people");
    await page.getByRole("button", { name: /add person/i }).click();

    // Sheet opens
    await expect(page.getByRole("dialog")).toBeVisible();

    // Fill in fields
    const ts = Date.now();
    const name = `Test Person ${ts}`;
    await page.getByLabel("ICG-ID").fill(`TS-${String(ts).slice(-5)}A`);
    await page.getByLabel("Display Name").fill(name);

    await page.getByRole("button", { name: /create person/i }).click();

    // Wait for success — either redirect or toast confirms creation
    await waitForToast(page, "Person created");
    // Navigate to list and confirm person appears
    await page.goto("/people");
    await expect(page.getByText(name, { exact: false })).toBeVisible();
  });

  test("detail page has Edit + Delete buttons", async ({ page }) => {
    await page.goto("/people/seed-person-1");
    await expect(page.getByRole("button", { name: /edit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();
  });

  test("edit person sheet opens and pre-populates", async ({ page }) => {
    await page.goto("/people/seed-person-1");
    await page.getByRole("button", { name: /edit/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/icg-id/i)).toBeVisible();

    // Display name field should be pre-filled
    const displayNameInput = dialog.getByLabel(/display name/i);
    await expect(displayNameInput).not.toHaveValue("");

    // Change display name and save
    const original = await displayNameInput.inputValue();
    await displayNameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Person updated");
    await expect(dialog).not.toBeVisible();

    // Revert
    await page.getByRole("button", { name: /edit/i }).click();
    await dialog.getByLabel(/display name/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Person updated");
  });
});

// ── Labels ─────────────────────────────────────────────────────────────────────

test.describe("Labels CRUD", () => {
  let createdLabelId: string;

  test("list page has Add Label button", async ({ page }) => {
    await page.goto("/labels");
    await expect(page.getByRole("heading", { name: "Labels" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add label/i })).toBeVisible();
  });

  test("create label", async ({ page }) => {
    await page.goto("/labels");
    await page.getByRole("button", { name: /add label/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const ts = Date.now();
    await dialog.getByLabel(/^name/i).fill(`Test Label ${ts}`);
    await dialog.getByLabel(/website/i).fill("https://test.example.com");
    await dialog.getByLabel(/description/i).fill("Playwright test label");

    await dialog.getByRole("button", { name: /create label/i }).click();

    await waitForToast(page, "Label created");
    await expect(page).toHaveURL(/\/labels\/.+/);
    createdLabelId = page.url().split("/labels/")[1];
    await expect(page.getByRole("button", { name: /edit/i })).toBeVisible();
  });

  test("edit label", async ({ page }) => {
    await page.goto("/labels/seed-label-1");

    await page.getByRole("button", { name: /edit/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    await expect(nameInput).not.toHaveValue("");

    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Label updated");

    // Revert
    await page.getByRole("button", { name: /edit/i }).click();
    await dialog.getByLabel(/^name/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Label updated");
  });
});

// ── Networks ──────────────────────────────────────────────────────────────────

test.describe("Networks CRUD", () => {
  test("list page has Add Network button", async ({ page }) => {
    await page.goto("/networks");
    await expect(page.getByRole("heading", { name: "Networks" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add network/i })).toBeVisible();
  });

  test("create network", async ({ page }) => {
    await page.goto("/networks");
    await page.getByRole("button", { name: /add network/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const ts = Date.now();
    await dialog.getByLabel(/^name/i).fill(`Test Network ${ts}`);
    await dialog.getByLabel(/description/i).fill("Playwright test network");

    await dialog.getByRole("button", { name: /create network/i }).click();

    await waitForToast(page, "Network created");
    await expect(page).toHaveURL(/\/networks\/.+/);
    await expect(page.getByRole("button", { name: /edit/i })).toBeVisible();
  });

  test("edit network", async ({ page }) => {
    await page.goto("/networks/seed-network-1");

    await page.getByRole("button", { name: /edit/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Network updated");

    // Revert
    await page.getByRole("button", { name: /edit/i }).click();
    await dialog.getByLabel(/^name/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Network updated");
  });
});

// ── Projects ──────────────────────────────────────────────────────────────────

test.describe("Projects CRUD", () => {
  test("list page has Add Project button", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add project/i })).toBeVisible();
  });

  test("create project", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: /add project/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const ts = Date.now();
    const name = `Test Project ${ts}`;
    await dialog.getByLabel(/^name/i).fill(name);
    await dialog.getByLabel(/description/i).fill("Playwright test project");

    await dialog.getByRole("button", { name: /create project/i }).click();

    await waitForToast(page, "Project created");
    // Navigate to list and confirm project appears
    await page.goto("/projects");
    await expect(page.getByText(name, { exact: false })).toBeVisible();
  });

  test("edit project", async ({ page }) => {
    await page.goto("/projects/seed-project-1");

    await page.getByRole("button", { name: /edit/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Project updated");

    // Revert
    await page.getByRole("button", { name: /edit/i }).click();
    await dialog.getByLabel(/^name/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Project updated");
  });
});

// ── Sets ──────────────────────────────────────────────────────────────────────

test.describe("Sets CRUD", () => {
  test("list page has Add Set button", async ({ page }) => {
    await page.goto("/sets");
    await expect(page.getByRole("heading", { name: "Sets" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add set/i })).toBeVisible();
  });

  test("create set", async ({ page }) => {
    await page.goto("/sets");
    await page.getByRole("button", { name: /add set/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Step 1: Set details — select type
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Photo" }).click();

    const ts = Date.now();
    const title = `Test Set ${ts}`;
    await dialog.getByLabel(/title/i).fill(title);

    // Select channel (required in new Flow A wizard)
    const channelSelect = dialog.getByRole("combobox").nth(1);
    await channelSelect.click();
    const firstChannelOption = page.getByRole("option").first();
    await firstChannelOption.click();

    await dialog.getByRole("button", { name: /create set/i }).click();

    // Step 2: Contributors — skip to finish
    await expect(dialog.getByRole("button", { name: /skip/i })).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: /skip/i }).click();

    // Navigate to /sets and confirm set appears in the list
    await page.goto("/sets");
    await expect(page.getByText(title, { exact: false })).toBeVisible();
  });

  test("detail page shows Edit + Delete buttons", async ({ page }) => {
    await page.goto("/sets/seed-set-1");
    await expect(page.getByRole("button", { name: /edit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();
  });

  test("edit set sheet opens and pre-populates", async ({ page }) => {
    await page.goto("/sets/seed-set-1");
    await page.getByRole("button", { name: /edit/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Title should be pre-filled
    const titleInput = dialog.getByLabel(/title/i);
    await expect(titleInput).not.toHaveValue("");

    const original = await titleInput.inputValue();
    await titleInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Set updated");

    // Revert
    await page.getByRole("button", { name: /edit/i }).click();
    await dialog.getByLabel(/title/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Set updated");
  });
});

// ── Delete confirmation dialog ────────────────────────────────────────────────

test.describe("Delete confirmation dialog", () => {
  test("delete dialog appears and can be cancelled", async ({ page }) => {
    await page.goto("/labels/seed-label-1");

    await page.getByRole("button", { name: /delete/i }).click();
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText(/delete label/i)).toBeVisible();

    // Cancel — should not delete
    await alertDialog.getByRole("button", { name: /cancel/i }).click();
    await expect(alertDialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/labels\/seed-label-1/);
  });
});
