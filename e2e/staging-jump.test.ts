import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";
const FILTER_KEY = "staging-sets-filters";

// A jump from a person's career to one of their staged sets (2026-10-16): the
// workspace shows that person's staged sets — whatever sticky filters were left
// from an earlier visit — with the set paged in, scrolled to and focused, and
// never saves that view. Data is discovered from the staging API; the specs skip
// when the dataset has no person with staged photo sets.

type Target = { personId: string; setId: string; total: number };

type Item = { id: string; subjectPersonId: string | null };

async function findTarget(request: APIRequestContext): Promise<Target | null> {
  const res = await request.get(`${BASE}/api/staging-sets?status=PENDING,REVIEWING,APPROVED&isVideo=false&limit=100`);
  if (!res.ok()) return null;
  const items = ((await res.json()).items as Item[]).filter((i) => i.subjectPersonId);
  let best: Target | null = null;
  for (const personId of [...new Set(items.map((i) => i.subjectPersonId as string))].slice(0, 10)) {
    const q = `personId=${personId}&status=PENDING,REVIEWING,APPROVED&isVideo=false&sort=date`;
    const head = await (await request.get(`${BASE}/api/staging-sets?${q}&limit=1`)).json();
    const total = head.total as number;
    if (!total) continue;
    // The last set in the list's order — beyond the first page when there are more than 50
    const tail = await (await request.get(`${BASE}/api/staging-sets?${q}&limit=1&offset=${total - 1}`)).json();
    const setId = (tail.items as Item[])[0]?.id;
    if (setId && (!best || total > best.total)) best = { personId, setId, total };
  }
  return best;
}

function jumpUrl(t: Target) {
  return `/staging-sets?select=${t.setId}&jump=person&personId=${t.personId}&personLabel=Jump+Person&type=photo`;
}

// A sticky filter for somebody else, as an earlier visit leaves it
async function leaveOtherPersonFilter(page: Page) {
  await page.goto("/staging-sets");
  await page.evaluate((key) => {
    sessionStorage.setItem(key, JSON.stringify({ personId: "someone-else", personLabel: "Other Person" }));
  }, FILTER_KEY);
}

const savedFilters = (page: Page) =>
  page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "{}") as { personLabel?: string }, FILTER_KEY);

test.describe("Jump from a career to a staged set", () => {
  test("shows the person's sets with the target in view, and keeps the sticky filters", async ({ page, request }) => {
    const t = await findTarget(request);
    test.skip(!t, "No person with staged photo sets in the dataset");
    if (!t) return;

    await leaveOtherPersonFilter(page);
    await page.goto(jumpUrl(t));

    const row = page.locator(`[data-staging-id="${t.setId}"]`);
    await expect(row).toBeInViewport({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Jump Person's career · Back to my filters/ })).toBeVisible();
    expect((await savedFilters(page)).personLabel).toBe("Other Person");

    // Back: the earlier filters return, the jump is gone from the URL
    await page.getByRole("button", { name: /Back to my filters/ }).click();
    await expect(page).toHaveURL(/\/staging-sets$/);
    await expect(page.getByRole("button", { name: "Other Person" })).toBeVisible();
  });

  test("a filter changed during a jump becomes the sticky filters", async ({ page, request }) => {
    const t = await findTarget(request);
    test.skip(!t, "No person with staged photo sets in the dataset");
    if (!t) return;

    await leaveOtherPersonFilter(page);
    await page.goto(jumpUrl(t));
    await expect(page.locator(`[data-staging-id="${t.setId}"]`)).toBeInViewport({ timeout: 20_000 });

    await page.getByRole("button", { name: /^Pending/ }).click();
    await expect(page.getByRole("button", { name: /Back to my filters/ })).toHaveCount(0);
    await expect.poll(async () => (await savedFilters(page)).personLabel).toBe("Jump Person");
  });
});
