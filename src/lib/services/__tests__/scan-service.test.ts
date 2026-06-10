import { describe, expect, it } from "vitest";
import {
  pageDueLevel,
  assembleScanFiles,
  SCAN_CADENCE_DEFAULTS,
  type ScanIdentity,
} from "@/lib/services/scan-service";
import type { ScrapeSource } from "@/lib/services/scrape-source-service";

function src(partial: Partial<ScrapeSource>): ScrapeSource {
  return {
    id: partial.key ?? "id",
    key: "KEY",
    displayName: "Name",
    domains: [],
    isScannable: true,
    fileName: "",
    lineFormat: "ICGID_URL",
    urlPattern: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

const DAY = 86_400_000;

describe("pageDueLevel", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  const cadence = SCAN_CADENCE_DEFAULTS.NORMAL; // 30

  it("never-scanned is due with null age", () => {
    expect(pageDueLevel(null, cadence, now)).toEqual({ level: "due", ageDays: null });
  });

  it("within cadence is fresh", () => {
    const d = new Date(now.getTime() - 10 * DAY);
    expect(pageDueLevel(d, cadence, now).level).toBe("fresh");
  });

  it("at the cadence boundary is due", () => {
    const d = new Date(now.getTime() - 30 * DAY);
    expect(pageDueLevel(d, cadence, now).level).toBe("due");
  });

  it("past 2× cadence is overdue", () => {
    const d = new Date(now.getTime() - 61 * DAY);
    expect(pageDueLevel(d, cadence, now).level).toBe("overdue");
  });
});

describe("assembleScanFiles", () => {
  const thenude = src({
    key: "THENUDE",
    domains: ["thenude.com"],
    isScannable: true,
    fileName: "thenude.txt",
    lineFormat: "URL_ONLY",
  });
  const indexxx = src({
    key: "Indexxx",
    domains: ["indexxx.com"],
    isScannable: true,
    fileName: "indexxx.txt",
    lineFormat: "ICGID_URL",
  });
  const iafd = src({
    key: "IAFD",
    domains: ["iafd.com"],
    isScannable: false,
    fileName: "iafd.txt",
    lineFormat: "ICGID_URL",
  });

  const ids: ScanIdentity[] = [
    { url: "https://www.thenude.com/jane", icgId: "JA-1" },
    { url: "https://indexxx.com/m/jane", icgId: "JA-1" },
    { url: "https://indexxx.com/m/bob", icgId: "BO-2" },
    { url: "https://iafd.com/jane", icgId: "JA-1" }, // not scannable → dropped
  ];

  it("groups by platform into one file each, sorted by filename", () => {
    const files = assembleScanFiles(ids, [thenude, indexxx, iafd]);
    expect(files.map((f) => f.fileName)).toEqual(["indexxx.txt", "thenude.txt"]);
  });

  it("URL_ONLY emits bare urls; ICGID_URL emits icgId<TAB>url", () => {
    const files = assembleScanFiles(ids, [thenude, indexxx, iafd]);
    const tn = files.find((f) => f.platform === "THENUDE")!;
    const ix = files.find((f) => f.platform === "Indexxx")!;
    expect(tn.content).toBe("https://www.thenude.com/jane\n");
    expect(ix.content).toBe("JA-1\thttps://indexxx.com/m/jane\nBO-2\thttps://indexxx.com/m/bob\n");
    expect(ix.urlCount).toBe(2);
  });

  it("excludes non-scannable sources", () => {
    const files = assembleScanFiles(ids, [thenude, indexxx, iafd]);
    expect(files.some((f) => f.platform === "IAFD")).toBe(false);
  });

  it("dedupes repeated urls within a file", () => {
    const dup: ScanIdentity[] = [
      { url: "https://thenude.com/jane", icgId: "JA-1" },
      { url: "https://thenude.com/jane", icgId: "JA-1" },
    ];
    const files = assembleScanFiles(dup, [thenude]);
    expect(files[0].urlCount).toBe(1);
  });

  it("matches subdomains via domain suffix", () => {
    const sub: ScanIdentity[] = [{ url: "https://m.thenude.com/jane", icgId: "JA-1" }];
    const files = assembleScanFiles(sub, [thenude]);
    expect(files).toHaveLength(1);
  });
});
