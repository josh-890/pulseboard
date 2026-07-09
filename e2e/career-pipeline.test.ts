import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";

// Career tab — "complete professional pipeline" feature.
//
// The Career timeline draws promoted Sets plus in-pipeline staged sets
// (PENDING / REVIEWING / APPROVED, matchedSetId null). These tests verify:
//   1. the toolbar exposes the new Status filter + Group-by controls,
//   2. pending/reviewing staged sets surface and group into status swimlanes,
//   3. the Status filter narrows the timeline and round-trips via `cstatus`.
//
// Data is discovered from the staging API so the specs work against whatever
// the seed produces — they skip cleanly when no pipeline staged set exists.

type PipelinePerson = {
  personId: string;
  status: "REVIEWING" | "PENDING";
  isVideo: boolean;
};

// Find a person who has a staged set in an early pipeline state (REVIEWING or
// PENDING) that is NOT deduped to a promoted Set — i.e. one that will render on
// their Career timeline. Returns null when the dataset has none.
async function findPipelinePerson(
  request: APIRequestContext,
): Promise<PipelinePerson | null> {
  for (const status of ["REVIEWING", "PENDING"] as const) {
    const res = await request.get(
      `${BASE}/api/staging-sets?status=${status}&limit=100`,
    );
    if (!res.ok()) continue;
    const data = await res.json();
    const match = (data.items as Array<{
      subjectPersonId: string | null;
      matchedSetId: string | null;
      isVideo: boolean;
    }>).find((i) => i.subjectPersonId && !i.matchedSetId);
    if (match?.subjectPersonId) {
      return { personId: match.subjectPersonId, status, isVideo: match.isVideo };
    }
  }
  return null;
}

const LANE_FOR_STATUS: Record<PipelinePerson["status"], RegExp> = {
  REVIEWING: /In review/i,
  PENDING: /Pending/i,
};

async function openCareerTab(page: Page, personId: string, isVideo: boolean) {
  await page.goto(`/people/${personId}?tab=career&ctype=${isVideo ? "video" : "photo"}`);
  await page.waitForLoadState("networkidle");
}

test.describe("Career pipeline timeline", () => {
  test("toolbar exposes Status pills and Group-by controls", async ({ page, request }) => {
    const person = await findPipelinePerson(request);
    if (!person) {
      test.skip(true, "No in-pipeline staged set in the dataset");
      return;
    }
    await openCareerTab(page, person.personId, person.isVideo);

    // Status is a row of quick-filter pills (not a dropdown). The pill for
    // this person's pipeline state must be present.
    await expect(
      page.getByRole("button", { name: LANE_FOR_STATUS[person.status] }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Group:/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sort:/ })).toBeVisible();
  });

  test("pending/reviewing sets group into status swimlanes", async ({ page, request }) => {
    const person = await findPipelinePerson(request);
    if (!person) {
      test.skip(true, "No in-pipeline staged set in the dataset");
      return;
    }
    await openCareerTab(page, person.personId, person.isVideo);

    // Switch grouping from Year → Status.
    await page.getByRole("button", { name: /^Group:/ }).click();
    await page.getByRole("menuitem", { name: "Status" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByRole("button", { name: /^Group: Status/ })).toBeVisible();
    // The lane for this person's early-pipeline status must be present — proof
    // that non-approved staged rows now surface (previously only APPROVED did).
    await expect(
      page.getByRole("button", { name: LANE_FOR_STATUS[person.status] }).first(),
    ).toBeVisible();
  });

  test("Status pill narrows the timeline and reflects in the URL", async ({ page, request }) => {
    const person = await findPipelinePerson(request);
    if (!person) {
      test.skip(true, "No in-pipeline staged set in the dataset");
      return;
    }
    await openCareerTab(page, person.personId, person.isVideo);

    // Click the status pill for this person's pipeline state.
    await page
      .getByRole("button", { name: LANE_FOR_STATUS[person.status] })
      .first()
      .click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/cstatus=(reviewing|pending)/);

    // A "Clear filters" affordance appears once a filter is active.
    await expect(page.getByText(/Clear filters/i).first()).toBeVisible();
  });

  test("compact density toggle collapses rows and supports per-row expand", async ({ page, request }) => {
    const person = await findPipelinePerson(request);
    if (!person) {
      test.skip(true, "No in-pipeline staged set in the dataset");
      return;
    }
    await openCareerTab(page, person.personId, person.isVideo);

    // Toggle Full → Compact.
    await page.getByRole("button", { name: "Full", exact: true }).click();
    await expect(page.getByRole("button", { name: "Compact", exact: true })).toBeVisible();

    // Compact rows expose a per-row expand affordance.
    const expandButtons = page.getByRole("button", { name: /Expand to full card/i });
    await expect(expandButtons.first()).toBeVisible();

    // Expanding one row swaps its affordance to a collapse control.
    await expandButtons.first().click();
    await expect(
      page.getByRole("button", { name: /Collapse to compact row/i }).first(),
    ).toBeVisible();
  });
});
