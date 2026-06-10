import { describe, expect, it } from "vitest";
import {
  resolveSourceFromUrl,
  resolvePlatformFromUrl,
  type ScrapeSource,
} from "@/lib/services/scrape-source-service";

function src(partial: Partial<ScrapeSource>): ScrapeSource {
  return {
    id: partial.key ?? "id",
    key: "KEY",
    displayName: "Name",
    domains: [],
    isScannable: false,
    fileName: "",
    lineFormat: "ICGID_URL",
    urlPattern: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

const sources: ScrapeSource[] = [
  src({ key: "THENUDE", domains: ["thenude.com"] }),
  src({ key: "Indexxx", domains: ["indexxx.com"] }),
];

describe("resolveSourceFromUrl", () => {
  it("matches host exactly (stripping www)", async () => {
    const s = await resolveSourceFromUrl("https://www.thenude.com/jane", sources);
    expect(s?.key).toBe("THENUDE");
  });

  it("matches subdomains via suffix", async () => {
    const s = await resolveSourceFromUrl("https://m.indexxx.com/x", sources);
    expect(s?.key).toBe("Indexxx");
  });

  it("returns null for an unknown host", async () => {
    expect(await resolveSourceFromUrl("https://example.com/x", sources)).toBeNull();
  });

  it("returns null for an unparseable url", async () => {
    expect(await resolveSourceFromUrl("not a url", sources)).toBeNull();
  });
});

describe("resolvePlatformFromUrl", () => {
  it("returns the registry key on match", async () => {
    expect(await resolvePlatformFromUrl("https://thenude.com/jane", sources)).toBe("THENUDE");
  });

  it("falls back to the capitalized domain when unknown", async () => {
    expect(await resolvePlatformFromUrl("https://onlyfans.com/jane", sources)).toBe("Onlyfans");
  });

  it("returns 'Source' for an unparseable url", async () => {
    expect(await resolvePlatformFromUrl("garbage", sources)).toBe("Source");
  });
});
