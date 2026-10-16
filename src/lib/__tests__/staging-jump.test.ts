import { describe, expect, it } from "vitest";
import { stagedSetJumpHref, stagingJumpPersonLabel } from "@/lib/staging-jump";

describe("stagedSetJumpHref", () => {
  it("carries the set, the person and the tab", () => {
    const href = stagedSetJumpHref({
      stagingSetId: "s1",
      isVideo: true,
      person: { id: "p1", label: stagingJumpPersonLabel("Alisa", "AB-12") },
    });
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/staging-sets");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select: "s1",
      jump: "person",
      personId: "p1",
      personLabel: "Alisa (AB-12)",
      type: "video",
    });
  });

  it("names a person without ICG-ID by name alone", () => {
    expect(stagingJumpPersonLabel("Alisa", null)).toBe("Alisa");
  });
});
