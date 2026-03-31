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
    // Scope to the header actions grid row (back link and actions are in separate grid cells)
    const headerRow = page.getByRole("link", { name: "Back to People" }).locator("../..");
    await expect(headerRow.getByRole("button", { name: /^edit$/i })).toBeVisible();
    // Use .first() because persona timeline entries also have Delete buttons
    await expect(page.getByRole("button", { name: /delete/i }).first()).toBeVisible();
  });

  test("edit person sheet opens and pre-populates", async ({ page }) => {
    await page.goto("/people/seed-person-1");
    // Scope to the header actions grid row (back link and actions are in separate grid cells)
    const headerRow = page.getByRole("link", { name: "Back to People" }).locator("../..");
    await headerRow.getByRole("button", { name: /^edit$/i }).click();

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

    // Wait for page to finish refreshing before opening the sheet again
    await page.waitForLoadState("networkidle");

    // Revert — scope to header actions grid row (back link and actions are in separate grid cells)
    const editBtn = page.getByRole("link", { name: "Back to People" }).locator("../..").getByRole("button", { name: /^edit$/i });
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
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
    await expect(page).toHaveURL(/\/labels\/.+/, { timeout: 10000 });
    createdLabelId = page.url().split("/labels/")[1];
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
  });

  test("edit label", async ({ page }) => {
    await page.goto("/labels/seed-label-1");

    await page.getByRole("button", { name: /^edit$/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    await expect(nameInput).not.toHaveValue("");

    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Label updated");

    // Revert
    await page.getByRole("button", { name: /^edit$/i }).first().click();
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
    await expect(page).toHaveURL(/\/networks\/.+/, { timeout: 15000 });
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
  });

  test("edit network", async ({ page }) => {
    await page.goto("/networks/seed-network-1");

    await page.getByRole("button", { name: /^edit$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Network updated");

    // Revert
    await page.getByRole("button", { name: /^edit$/i }).click();
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

    await page.getByRole("button", { name: /^edit$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Project updated");

    // Revert
    await page.getByRole("button", { name: /^edit$/i }).click();
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

  test("create set (standalone — auto-creates DRAFT session)", async ({ page }) => {
    await page.goto("/sets");
    await page.getByRole("button", { name: /add set/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Step 1: Set details — select type (toggle button)
    await dialog.getByRole("button", { name: "Photo" }).click();

    const ts = Date.now();
    const title = `Test Set ${ts}`;
    await dialog.getByLabel(/title/i).fill(title);

    // Select channel (required)
    const channelSelect = dialog.getByRole("combobox", { name: /channel/i });
    await channelSelect.click();
    const firstChannelOption = page.getByRole("option").first();
    await firstChannelOption.click();

    // Scroll to and click the submit button (label suggestions may push it offscreen)
    const createBtn = dialog.getByRole("button", { name: /create set/i });
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();

    // Step 2: Credits — skip to finish
    await expect(dialog.getByText(/add credits/i)).toBeVisible({ timeout: 8000 });
    await dialog.getByRole("button", { name: /skip/i }).click();

    // Navigate to /sets and confirm set appears in the list
    await page.goto("/sets");
    await expect(page.getByText(title, { exact: false })).toBeVisible();
  });

  test("create set with credits", async ({ page }) => {
    await page.goto("/sets");
    await page.getByRole("button", { name: /add set/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Step 1: Fill in set details — select type (toggle button)
    await dialog.getByRole("button", { name: "Photo" }).click();

    const ts = Date.now();
    const title = `Credit Set ${ts}`;
    await dialog.getByLabel(/title/i).fill(title);

    const channelSelect = dialog.getByRole("combobox", { name: /channel/i });
    await channelSelect.click();
    await page.getByRole("option").first().click();

    // Scroll to and click the submit button
    const createBtn = dialog.getByRole("button", { name: /create set/i });
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();

    // Step 2: Credits — wait for transition
    await expect(dialog.getByText(/add credits/i)).toBeVisible({ timeout: 8000 });

    const creditInput = dialog.getByPlaceholder(/search person.*raw name/i);
    await creditInput.fill("Test Raw Name");
    await creditInput.press("Enter");

    // Verify the credit appears in the list
    await expect(dialog.getByText("Test Raw Name")).toBeVisible();
    await expect(dialog.getByText("Unresolved")).toBeVisible();

    // Click Done to save and navigate to detail page
    await dialog.getByRole("button", { name: /^done$/i }).click();

    // Wait for navigation to detail page (may take a moment to save credits)
    await page.waitForURL(/\/sets\/[a-z0-9]/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 10000 });
  });

  test("detail page shows Edit + Delete buttons", async ({ page }) => {
    await page.goto("/sets/seed-set-1");
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();
  });

  test("edit set sheet opens and pre-populates", async ({ page }) => {
    await page.goto("/sets/seed-set-1");
    await page.getByRole("button", { name: /^edit$/i }).click();

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
    await page.getByRole("button", { name: /^edit$/i }).click();
    await dialog.getByLabel(/title/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Set updated");
  });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

test.describe("Sessions CRUD", () => {
  test("list page loads and has Add Session button", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add session/i })).toBeVisible();
  });

  test("create session", async ({ page }) => {
    await page.goto("/sessions");
    await page.getByRole("button", { name: /add session/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const ts = Date.now();
    const name = `Test Session ${ts}`;
    await dialog.getByLabel(/^name/i).fill(name);

    await dialog.getByRole("button", { name: /create session/i }).click();

    await waitForToast(page, "Session created");
    await expect(page).toHaveURL(/\/sessions\/.+/, { timeout: 15000 });
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
  });

  test("detail page has Edit + Delete + Merge buttons", async ({ page }) => {
    await page.goto("/sessions/seed-session-1");
    await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /merge/i })).toBeVisible();
  });

  test("reference session hides edit/delete/merge and shows person link", async ({ page }) => {
    await page.goto("/sessions/seed-session-ref");
    // Edit, Delete, Merge should NOT be visible
    await expect(page.getByRole("button", { name: /^edit$/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /merge/i })).not.toBeVisible();
    // Person link should be visible
    await expect(page.getByRole("link", { name: "Back to Jane" })).toBeVisible();
  });

  test("edit session sheet opens and pre-populates", async ({ page }) => {
    await page.goto("/sessions/seed-session-1");
    await page.getByRole("button", { name: /^edit$/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/^name/i);
    await expect(nameInput).not.toHaveValue("");

    const original = await nameInput.inputValue();
    await nameInput.fill(original + " (edited)");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await waitForToast(page, "Session updated");

    // Revert
    await page.getByRole("button", { name: /^edit$/i }).click();
    await dialog.getByLabel(/^name/i).fill(original);
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await waitForToast(page, "Session updated");
  });
});

// ── Video sets ────────────────────────────────────────────────────────────────

test.describe("Video sets", () => {
  test("video set detail shows Frames chip (not Photos)", async ({ page }) => {
    await page.goto("/sets/seed-set-video-1");
    // "Frames" completeness chip should be visible
    await expect(page.getByText("Frames", { exact: true })).toBeVisible();
    // "Photos" chip must NOT appear
    await expect(page.getByText("Photos", { exact: true })).not.toBeVisible();
  });

  test("video set detail shows clip group headers for sourceVideoRef frames", async ({ page }) => {
    await page.goto("/sets/seed-set-video-1");
    // Both seed clip names should appear as group headers
    await expect(page.getByText("interview_take3.mp4")).toBeVisible();
    await expect(page.getByText("b_roll_kitchen.mp4")).toBeVisible();
    // Frame counts in headers
    await expect(page.getByText(/2\s+frames?/)).toBeVisible();
    await expect(page.getByText(/1\s+frame/)).toBeVisible();
  });

  test("session with mixed photo+video sets shows breakdown in hero stats", async ({ page }) => {
    // seed-session-1 has seed-set-1 (photo) + seed-set-video-1 (video) linked
    await page.goto("/sessions/seed-session-1");
    await expect(page.getByText(/1 photo.*1 video|2 sets.*1 photo.*1 video/)).toBeVisible();
  });

  test("create video set selects Video type and appears in list", async ({ page }) => {
    await page.goto("/sets");
    await page.getByRole("button", { name: /add set/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Select Video type
    await dialog.getByRole("button", { name: "Video" }).click();

    const ts = Date.now();
    const title = `Test Set Video ${ts}`;
    await dialog.getByLabel(/title/i).fill(title);

    const channelSelect = dialog.getByRole("combobox", { name: /channel/i });
    await channelSelect.click();
    await page.getByRole("option").first().click();

    const createBtn = dialog.getByRole("button", { name: /create set/i });
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();

    // Skip credits
    await expect(dialog.getByText(/add credits/i)).toBeVisible({ timeout: 8000 });
    await dialog.getByRole("button", { name: /skip/i }).click();

    // Verify set appears in list
    await page.goto("/sets");
    await expect(page.getByText(title, { exact: false })).toBeVisible();
  });
});

// ── Delete confirmation dialog ────────────────────────────────────────────────

test.describe("Delete confirmation dialog", () => {
  test("delete dialog appears and can be cancelled", async ({ page }) => {
    await page.goto("/labels/seed-label-1");

    await page.getByRole("button", { name: /delete/i }).first().click();
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText(/delete label/i)).toBeVisible();

    // Cancel — should not delete
    await alertDialog.getByRole("button", { name: /cancel/i }).click();
    await expect(alertDialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/labels\/seed-label-1/);
  });
});
