import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:3000";

// Career tab — promote an approved staged set without leaving the person.
//
// Approved rows/tiles carry a Promote button; its popover asks the server what
// a promote would do (new set vs. enrich an existing one) before offering the
// click. These specs stop short of promoting — a promote is permanent — and
// verify the button, the preview and the way out to Staging Sets.
//
// Data is discovered from the staging API so the specs run against whatever the
// dataset holds — they skip cleanly when no approved staged set exists.

type ApprovedSet = { id: string; personId: string; isVideo: boolean; title: string };

async function findApprovedSet(request: APIRequestContext): Promise<ApprovedSet | null> {
  const res = await request.get(`${BASE}/api/staging-sets?status=APPROVED&limit=100`);
  if (!res.ok()) return null;
  const data = await res.json();
  const match = (data.items as Array<{
    id: string;
    title: string;
    subjectPersonId: string | null;
    matchedSetId: string | null;
    isVideo: boolean;
  }>).find((i) => i.subjectPersonId && !i.matchedSetId);
  return match?.subjectPersonId
    ? { id: match.id, personId: match.subjectPersonId, isVideo: match.isVideo, title: match.title }
    : null;
}

// An approved set with someone in it who is not yet a Person — the preview is
// the authority, so the candidate list is filtered through it.
async function findBlockedSet(request: APIRequestContext): Promise<ApprovedSet | null> {
  let checked = 0;
  // offset paging: cursor paging under a status filter returns an empty page 2
  for (let page = 0; page < 20 && checked < 15; page++) {
    const res = await request.get(`${BASE}/api/staging-sets?status=APPROVED&limit=100&offset=${page * 100}`);
    if (!res.ok()) return null;
    const data = await res.json();
    const candidates = (data.items as Array<{
      id: string;
      title: string;
      subjectPersonId: string | null;
      matchedSetId: string | null;
      isVideo: boolean;
      participantStatuses: Array<{ status?: string }> | null;
    }>).filter(
      (i) => i.subjectPersonId && !i.matchedSetId && (i.participantStatuses ?? []).some((p) => p.status !== "known"),
    );
    for (const c of candidates) {
      if (++checked > 15) break;
      const preview = await (await request.get(`${BASE}/api/staging-sets/${c.id}/promote-preview`)).json();
      if (preview.undevelopedParticipants?.length > 0) {
        return { id: c.id, personId: c.subjectPersonId!, isVideo: c.isVideo, title: c.title };
      }
    }
    if ((data.items as unknown[]).length < 100) break;
  }
  return null;
}

test.describe("Career promote", () => {
  test("preview API answers for an approved set and refuses a pending one", async ({ request }) => {
    const approved = await findApprovedSet(request);
    if (!approved) {
      test.skip(true, "No approved staged set in the dataset");
      return;
    }
    const ok = await (await request.get(`${BASE}/api/staging-sets/${approved.id}/promote-preview`)).json();
    expect(["create-new", "enrich"]).toContain(ok.kind);

    const pending = await (await request.get(`${BASE}/api/staging-sets?status=PENDING&limit=1`)).json();
    const pendingId = (pending.items as Array<{ id: string }>)[0]?.id;
    if (pendingId) {
      const refused = await (await request.get(`${BASE}/api/staging-sets/${pendingId}/promote-preview`)).json();
      expect(refused.kind).toBe("not-promotable");
    }
  });

  for (const view of ["list", "gallery"] as const) {
    test(`approved set shows Promote with a preview (${view})`, async ({ page, request }) => {
      const approved = await findApprovedSet(request);
      if (!approved) {
        test.skip(true, "No approved staged set in the dataset");
        return;
      }
      await page.goto(
        `/people/${approved.personId}?tab=career&ctype=${approved.isVideo ? "video" : "photo"}&cstatus=approved&view=${view}`,
      );
      await page.waitForLoadState("networkidle");
      // The view is restored from the URL after mount — wait for it, or the
      // click lands on a list row that the gallery is about to replace.
      await expect(
        page.getByRole("group", { name: "View" }).getByRole("button", { name: view === "list" ? "List" : "Gallery" }),
      ).toHaveAttribute("aria-pressed", "true");

      const button = page.getByRole("button", { name: `Promote ${approved.title}`, exact: true }).first();
      await expect(button).toBeVisible();
      await button.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/Creates a new set|Adds to the existing set/)).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByRole("button", { name: "Promote" })).toBeEnabled();
      await expect(dialog.getByRole("link", { name: "Open in staging" })).toHaveAttribute(
        "href",
        new RegExp(`select=${approved.id}`),
      );

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  }

  test("a set with someone new to the app is locked: amber, warned, refused", async ({ page, request }) => {
    const blocked = await findBlockedSet(request);
    if (!blocked) {
      test.skip(true, "No approved staged set with an undeveloped cast in the dataset");
      return;
    }
    // The route refuses before anything is promoted
    const refused = await request.post(`${BASE}/api/staging-sets/${blocked.id}/promote`, {
      data: { requireDevelopedCast: true },
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).undevelopedParticipants.length).toBeGreaterThan(0);

    await page.goto(
      `/people/${blocked.personId}?tab=career&ctype=${blocked.isVideo ? "video" : "photo"}&cstatus=approved&view=list`,
    );
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }),
    ).toHaveAttribute("aria-pressed", "true");

    const button = page.locator(`[data-cast-blocked]`).filter({ hasText: "Promote" }).first();
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-label", /not everyone in it is in the app yet/);
    await button.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toContainText("Not everyone in this set is in the app yet");
    await expect(dialog.getByText(/Creates a new set|Adds to the existing set/)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole("button", { name: "Promote" })).toBeDisabled();
    await expect(dialog.getByRole("link", { name: "Open in staging" })).toBeVisible();
  });

  test("promoted-only view carries no Promote button", async ({ page, request }) => {
    const approved = await findApprovedSet(request);
    if (!approved) {
      test.skip(true, "No approved staged set in the dataset");
      return;
    }
    await page.goto(
      `/people/${approved.personId}?tab=career&ctype=${approved.isVideo ? "video" : "photo"}&cstatus=promoted&view=list`,
    );
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /^Promote / })).toHaveCount(0);
  });
});
