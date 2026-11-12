import { test, expect } from "@playwright/test";

// Sidebar grouped by job (2026-11-12): Library · Makers · Curate · Discover ·
// Pipeline; Maintenance and Settings pinned to the foot, Sign out as an icon beside them. On the icon rail the headings become
// dividers; on a phone the drawer shows the same groups.

const SECTIONS: [string, string[]][] = [
  ["Library", ["People", "Sets", "Sessions"]],
  ["Makers", ["Channels", "Labels", "Artists", "Projects"]],
  ["Curate", ["Favorites", "Collections", "Tags", "Atlas"]],
  ["Discover", ["Contacts", "Watchlist", "Shopping List"]],
  ["Pipeline", ["Import", "Staging Sets", "Archive"]],
];

test("the sidebar groups its links under headed sections, in order", async ({ page }) => {
  await page.goto("/channels");
  const nav = page.getByRole("complementary").getByRole("navigation", { name: "Main" });
  for (const [title, labels] of SECTIONS) {
    const group = nav.getByRole("group", { name: title });
    await expect(group.getByRole("link")).toHaveText(labels);
  }
  // The active item sits in its section.
  await expect(nav.getByRole("group", { name: "Makers" }).getByRole("link", { name: "Channels" })).toHaveClass(/font-medium/);
  await expect(nav.getByRole("link")).toHaveCount(1 + SECTIONS.reduce((n, [, l]) => n + l.length, 0));
  // The system pages sit in their own block at the foot, out of the scrolling list.
  const system = page.getByRole("complementary").getByRole("navigation", { name: "System" });
  await expect(system.getByRole("link")).toHaveText(["Maintenance", "Settings"]);
  const sysBox = (await system.boundingBox())!;
  const signOut = (await page.getByRole("button", { name: "Sign out" }).boundingBox())!;
  expect(sysBox.y + sysBox.height).toBeGreaterThan(page.viewportSize()!.height - 80);
  expect(signOut.x).toBeGreaterThan(sysBox.x + sysBox.width - 1); // beside, on the right
  // Archive (last of the scrolling list) still fits a 1000 px window without scrolling.
  await page.setViewportSize({ width: 1400, height: 1000 });
  await expect(nav.getByRole("link", { name: "Archive" })).toBeInViewport({ ratio: 1 });
});

test("on a phone the drawer shows the same sections", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("dialog").getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("group", { name: "Pipeline" }).getByRole("link")).toHaveText(["Import", "Staging Sets", "Archive"]);
  await nav.getByRole("link", { name: "Artists" }).click();
  await expect(page).toHaveURL(/\/artists$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
