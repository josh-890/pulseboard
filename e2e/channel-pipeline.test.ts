import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:3000";

// Channel detail — "In pipeline" section.
//
// `/channels/[id]` used to list promoted Sets only, so a channel whose work was
// all still staged read as empty while /staging-sets showed its sets. The page
// now counts the channel's PENDING / REVIEWING / APPROVED staged sets and deep
// links into the staging workspace narrowed to that channel (and its tier).
//
// Data is discovered from the staging API so the specs work against whatever
// the dataset holds — they skip cleanly when no channel has a pipeline set.

type PipelineItem = {
  id: string;
  channelId: string | null;
  isVideo: boolean;
};

async function findPipelineItem(
  request: APIRequestContext,
): Promise<PipelineItem | null> {
  for (const isVideo of ["false", "true"]) {
    const res = await request.get(
      `${BASE}/api/staging-sets?status=PENDING,REVIEWING,APPROVED&channelTier=PREMIUM,HIGH,NORMAL,LOW,TRASH&isVideo=${isVideo}&limit=50`,
    );
    if (!res.ok()) continue;
    const data = await res.json();
    const match = (data.items as PipelineItem[]).find((i) => i.channelId);
    if (match) return match;
  }
  return null;
}

test.describe("Channel pipeline section", () => {
  test("shows staged sets and a matching stats tile", async ({ page, request }) => {
    const item = await findPipelineItem(request);
    if (!item?.channelId) {
      test.skip(true, "No channel with an in-pipeline staged set");
      return;
    }

    await page.goto(`/channels/${item.channelId}`);
    await page.waitForLoadState("networkidle");

    const heading = page.getByRole("heading", { name: /^In pipeline \(\d+\)$/ });
    await expect(heading).toBeVisible();
    const total = Number((await heading.textContent())?.match(/\((\d+)\)/)?.[1]);
    expect(total).toBeGreaterThan(0);

    // Stats tile carries the same number and jumps to the section.
    const tile = page.getByRole("link", { name: new RegExp(`^${total}\\s*In pipeline$`) });
    await expect(tile).toHaveAttribute("href", "#pipeline");

    // The row for the discovered staged set deep-links to it.
    const row = page.locator(`a[href*="select=${item.id}"]`);
    await expect(row).toBeVisible();
  });

  test("type link opens staging sets narrowed to the channel", async ({ page, request }) => {
    const item = await findPipelineItem(request);
    if (!item?.channelId) {
      test.skip(true, "No channel with an in-pipeline staged set");
      return;
    }

    await page.goto(`/channels/${item.channelId}`);
    await page.waitForLoadState("networkidle");
    // The channel link's own label carries the channel name (the shell has an h1 too).
    const typeLinkHref = await page
      .getByRole("link", { name: item.isVideo ? /\d+ videos?/ : /\d+ photo sets?/ })
      .getAttribute("href");
    const channelName = new URL(typeLinkHref ?? "", BASE).searchParams.get("channelLabel");
    expect(channelName).toBeTruthy();

    const typeLink = page.getByRole("link", {
      name: item.isVideo ? /\d+ videos?/ : /\d+ photo sets?/,
    });
    const href = await typeLink.getAttribute("href");
    expect(href).toContain(`channelId=${item.channelId}`);
    expect(href).toContain("channelTier=");

    // Wait for the workspace's list fetch that carries the channel filter.
    const listFetch = page.waitForRequest(
      (req) =>
        req.url().includes("/api/staging-sets?") &&
        req.url().includes(`channelId=${item.channelId}`),
    );
    await typeLink.click();
    await page.waitForURL(/\/staging-sets\?/);
    await listFetch;

    await expect(
      page.getByRole("tab", { name: item.isVideo ? /Video Sets/i : /Photo Sets/i }),
    ).toHaveAttribute("data-state", "active");

    // Visible, removable channel chip — the filter is never silent.
    const chip = page.getByRole("button", { name: `Remove channel filter ${channelName}` });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toBeHidden();
  });
});
