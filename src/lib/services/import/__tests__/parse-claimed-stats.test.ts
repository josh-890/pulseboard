import { describe, expect, it } from "vitest";
import { parseClaimedStats } from "@/lib/services/import/parse-claimed-stats";

describe("parseClaimedStats", () => {
  it("parses the canonical 'covers, photosets and videos' sentence", () => {
    expect(
      parseClaimedStats("Jane Doe has 70 covers, 50 photosets and 20 videos."),
    ).toEqual({ photosets: 50, videos: 20 });
  });

  it("ignores the covers figure (it is derived)", () => {
    // 70 covers must not be mistaken for either stored metric.
    const r = parseClaimedStats("70 covers, 50 photosets and 20 videos");
    expect(r.photosets).toBe(50);
    expect(r.videos).toBe(20);
  });

  it("accepts 'photo sets' and 'photo-sets' spellings", () => {
    expect(parseClaimedStats("has 12 photo sets and 3 videos").photosets).toBe(12);
    expect(parseClaimedStats("has 12 photo-sets and 3 videos").photosets).toBe(12);
  });

  it("handles singular nouns", () => {
    expect(parseClaimedStats("1 photoset and 1 video")).toEqual({
      photosets: 1,
      videos: 1,
    });
  });

  it("strips thousands separators", () => {
    expect(parseClaimedStats("1,234 photosets and 1,000 videos")).toEqual({
      photosets: 1234,
      videos: 1000,
    });
  });

  it("returns null for a metric that is absent", () => {
    expect(parseClaimedStats("appeared in 50 photosets")).toEqual({
      photosets: 50,
      videos: null,
    });
  });

  it("returns nulls when there is no stats line", () => {
    expect(parseClaimedStats("A model and dancer from Prague.")).toEqual({
      photosets: null,
      videos: null,
    });
  });

  it("returns nulls for empty / nullish input", () => {
    expect(parseClaimedStats(null)).toEqual({ photosets: null, videos: null });
    expect(parseClaimedStats(undefined)).toEqual({ photosets: null, videos: null });
    expect(parseClaimedStats("")).toEqual({ photosets: null, videos: null });
  });
});
