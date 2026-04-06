import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

// ── UI Tests ─────────────────────────────────────────────────────────────────

test.describe("Staging Sets Workspace UI", () => {
  test("page loads with header, tabs, and filter bar", async ({ page }) => {
    await page.goto("/staging-sets");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Staging Sets" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Photo Sets/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Video Sets/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search/i)).toBeVisible();
  });

  test("photo tab is active by default", async ({ page }) => {
    await page.goto("/staging-sets");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tab", { name: /Photo Sets/i })).toHaveAttribute("data-state", "active");
  });

  test("tabs switch between photo and video", async ({ page }) => {
    await page.goto("/staging-sets");
    await page.waitForLoadState("networkidle");

    const photoTab = page.getByRole("tab", { name: /Photo Sets/i });
    const videoTab = page.getByRole("tab", { name: /Video Sets/i });

    await videoTab.click();
    await expect(videoTab).toHaveAttribute("data-state", "active");
    await expect(photoTab).toHaveAttribute("data-state", "inactive");

    await photoTab.click();
    await expect(photoTab).toHaveAttribute("data-state", "active");
  });

  test("grid shows cards when data exists", async ({ page }) => {
    await page.goto("/staging-sets");
    await page.waitForLoadState("networkidle");

    // Check if summary line shows item count
    const summary = page.locator("text=/\\d+ items?/i");
    const count = await summary.count();
    if (count > 0) {
      // Cards should be visible in the grid
      const cards = page.locator("button[class*='rounded-xl']");
      await expect(cards.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("clicking a card opens slide panel", async ({ page }) => {
    await page.goto("/staging-sets");
    await page.waitForLoadState("networkidle");

    const cards = page.locator("button[class*='rounded-xl']");
    if (await cards.count() === 0) {
      test.skip();
      return;
    }

    await cards.first().click();
    await page.waitForTimeout(500);

    // Panel should show detail content (X button or heading)
    const panelClose = page.locator("button").filter({ has: page.locator("svg.lucide-x") });
    await expect(panelClose.first()).toBeVisible({ timeout: 3000 });
  });

  test("escape closes slide panel", async ({ page }) => {
    await page.goto("/staging-sets");
    await page.waitForLoadState("networkidle");

    const cards = page.locator("button[class*='rounded-xl']");
    if (await cards.count() === 0) {
      test.skip();
      return;
    }

    await cards.first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Panel close button should be gone
    const panelClose = page.locator("button").filter({ has: page.locator("svg.lucide-x") });
    await expect(panelClose).toHaveCount(0, { timeout: 2000 });
  });
});

// ── API Tests: List & Filter ─────────────────────────────────────────────────

test.describe("Staging Sets API — List & Filter", () => {
  test("GET /api/staging-sets returns paginated items", async ({ request }) => {
    const res = await request.get(`${BASE}/api/staging-sets`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("nextCursor");
    expect(Array.isArray(data.items)).toBeTruthy();
  });

  test("GET /api/staging-sets/stats returns complete stats", async ({ request }) => {
    const res = await request.get(`${BASE}/api/staging-sets/stats`);
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("byStatus");
    expect(stats).toHaveProperty("byType");
    expect(typeof stats.byType.photo).toBe("number");
    expect(typeof stats.byType.video).toBe("number");
  });

  test("photo + video = total", async ({ request }) => {
    const stats = await (await request.get(`${BASE}/api/staging-sets/stats`)).json();
    expect(stats.byType.photo + stats.byType.video).toBe(stats.total);
  });

  test("sum of status counts = total", async ({ request }) => {
    const stats = await (await request.get(`${BASE}/api/staging-sets/stats`)).json();
    const statusSum = Object.values(stats.byStatus as Record<string, number>).reduce(
      (a, b) => a + b, 0
    );
    expect(statusSum).toBe(stats.total);
  });

  test("isVideo=false returns only photo sets", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?isVideo=false&limit=20`)).json();
    for (const item of data.items) {
      expect(item.isVideo).toBe(false);
    }
  });

  test("isVideo=true returns only video sets", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?isVideo=true&limit=20`)).json();
    for (const item of data.items) {
      expect(item.isVideo).toBe(true);
    }
  });

  test("status filter returns matching items", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?status=PENDING&limit=10`)).json();
    for (const item of data.items) {
      expect(item.status).toBe("PENDING");
    }
  });

  test("noDate filter returns items with null releaseDate", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?noDate=true&limit=10`)).json();
    for (const item of data.items) {
      expect(item.releaseDate).toBeNull();
    }
  });

  test("all sort options return 200", async ({ request }) => {
    for (const sort of ["releaseDate", "title", "priority", "createdAt", "undatedFirst"]) {
      const res = await request.get(`${BASE}/api/staging-sets?sort=${sort}&limit=3`);
      expect(res.ok(), `sort=${sort}`).toBeTruthy();
    }
  });

  test("cursor pagination returns non-overlapping pages", async ({ request }) => {
    const page1 = await (await request.get(`${BASE}/api/staging-sets?limit=5`)).json();

    if (page1.nextCursor && page1.items.length === 5) {
      const page2 = await (await request.get(`${BASE}/api/staging-sets?limit=5&cursor=${page1.nextCursor}`)).json();
      if (page2.items.length > 0) {
        const ids1 = new Set(page1.items.map((i: { id: string }) => i.id));
        expect(page2.items.every((i: { id: string }) => !ids1.has(i.id))).toBeTruthy();
      }
    }
  });

  test("batchId filter scopes to specific batch", async ({ request }) => {
    const first = await (await request.get(`${BASE}/api/staging-sets?limit=1`)).json();
    if (first.items.length === 0) { test.skip(); return; }

    const batchId = first.items[0].importBatchId;
    const filtered = await (await request.get(`${BASE}/api/staging-sets?batchId=${batchId}&limit=100`)).json();
    for (const item of filtered.items) {
      expect(item.importBatchId).toBe(batchId);
    }
  });

  test("search with no matches returns empty", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?search=zzz_nonexistent_999`)).json();
    expect(data.items.length).toBe(0);
  });

  test("batch-scoped stats match actual count", async ({ request }) => {
    const first = await (await request.get(`${BASE}/api/staging-sets?limit=1`)).json();
    if (first.items.length === 0) { test.skip(); return; }

    const batchId = first.items[0].importBatchId;
    const stats = await (await request.get(`${BASE}/api/staging-sets/stats?batchId=${batchId}`)).json();
    const items = await (await request.get(`${BASE}/api/staging-sets?batchId=${batchId}&limit=200`)).json();
    expect(stats.total).toBe(items.items.length);
  });
});

// ── API Tests: CRUD ──────────────────────────────────────────────────────────

test.describe("Staging Sets API — CRUD", () => {
  test("GET single staging set by ID", async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/staging-sets?limit=1`)).json();
    if (list.items.length === 0) { test.skip(); return; }

    const id = list.items[0].id;
    const res = await request.get(`${BASE}/api/staging-sets/${id}`);
    expect(res.ok()).toBeTruthy();
    const item = await res.json();
    expect(item.id).toBe(id);
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("channelName");
    expect(item).toHaveProperty("importBatchId");
  });

  test("PATCH priority — update and restore", async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/staging-sets?limit=1`)).json();
    if (list.items.length === 0) { test.skip(); return; }

    const item = list.items[0];
    const newPriority = item.priority === 3 ? 2 : 3;

    const patched = await (await request.patch(`${BASE}/api/staging-sets/${item.id}`, {
      data: { priority: newPriority },
    })).json();
    expect(patched.priority).toBe(newPriority);

    // Restore
    await request.patch(`${BASE}/api/staging-sets/${item.id}`, {
      data: { priority: item.priority },
    });
  });

  test("PATCH status — update and restore", async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/staging-sets?status=PENDING&limit=1`)).json();
    if (list.items.length === 0) { test.skip(); return; }

    const id = list.items[0].id;
    const patched = await (await request.patch(`${BASE}/api/staging-sets/${id}`, {
      data: { status: "REVIEWING" },
    })).json();
    expect(patched.status).toBe("REVIEWING");

    await request.patch(`${BASE}/api/staging-sets/${id}`, { data: { status: "PENDING" } });
  });

  test("PATCH notes — update and restore", async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/staging-sets?limit=1`)).json();
    if (list.items.length === 0) { test.skip(); return; }

    const item = list.items[0];
    const patched = await (await request.patch(`${BASE}/api/staging-sets/${item.id}`, {
      data: { notes: "E2E test note" },
    })).json();
    expect(patched.notes).toBe("E2E test note");

    await request.patch(`${BASE}/api/staging-sets/${item.id}`, { data: { notes: item.notes ?? null } });
  });

  test("POST bulk-update multiple statuses — update and restore", async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/staging-sets?status=PENDING&limit=3`)).json();
    if (list.items.length < 2) { test.skip(); return; }

    const ids = list.items.slice(0, 2).map((i: { id: string }) => i.id);

    const result = await (await request.post(`${BASE}/api/staging-sets/bulk-update`, {
      data: { ids, status: "REVIEWING" },
    })).json();
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);

    // Verify
    for (const id of ids) {
      const item = await (await request.get(`${BASE}/api/staging-sets/${id}`)).json();
      expect(item.status).toBe("REVIEWING");
    }

    // Restore
    await request.post(`${BASE}/api/staging-sets/bulk-update`, { data: { ids, status: "PENDING" } });
  });

  test("POST bulk-update rejects empty ids", async ({ request }) => {
    const res = await request.post(`${BASE}/api/staging-sets/bulk-update`, {
      data: { ids: [], status: "REVIEWING" },
    });
    expect(res.status()).toBe(400);
  });
});

// ── Data Integrity ───────────────────────────────────────────────────────────

test.describe("Staging Set Data Integrity", () => {
  test("all staging sets have importBatchId", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?limit=50`)).json();
    for (const item of data.items) {
      expect(item.importBatchId).toBeTruthy();
    }
  });

  test("promoted sets have promotedSetId", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?status=PROMOTED&limit=20`)).json();
    for (const item of data.items) {
      expect(item.promotedSetId).toBeTruthy();
    }
  });

  test("matched sets have valid confidence (0–1)", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?limit=50`)).json();
    for (const item of data.items.filter((i: { matchedSetId: string | null }) => i.matchedSetId)) {
      expect(item.matchConfidence).toBeGreaterThanOrEqual(0);
      expect(item.matchConfidence).toBeLessThanOrEqual(1);
    }
  });

  test("every item has subjectIcgId", async ({ request }) => {
    const data = await (await request.get(`${BASE}/api/staging-sets?limit=50`)).json();
    for (const item of data.items) {
      expect(item.subjectIcgId).toBeTruthy();
    }
  });
});
