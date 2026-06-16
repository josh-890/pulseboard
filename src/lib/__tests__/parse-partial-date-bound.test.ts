import { describe, expect, it } from "vitest";
import { parsePartialDateBound } from "@/lib/utils";

const iso = (d: Date | undefined) => d?.toISOString();

describe("parsePartialDateBound", () => {
  it("expands a year to the whole year", () => {
    expect(iso(parsePartialDateBound("2016", "start"))).toBe("2016-01-01T00:00:00.000Z");
    expect(iso(parsePartialDateBound("2020", "end"))).toBe("2020-12-31T23:59:59.999Z");
  });

  it("expands a year-month to the whole month", () => {
    expect(iso(parsePartialDateBound("2016-03", "start"))).toBe("2016-03-01T00:00:00.000Z");
    expect(iso(parsePartialDateBound("2016-03", "end"))).toBe("2016-03-31T23:59:59.999Z");
    // February leap vs non-leap
    expect(iso(parsePartialDateBound("2016-02", "end"))).toBe("2016-02-29T23:59:59.999Z");
    expect(iso(parsePartialDateBound("2017-02", "end"))).toBe("2017-02-28T23:59:59.999Z");
  });

  it("keeps a full date (start = midnight, end = end-of-day)", () => {
    expect(iso(parsePartialDateBound("2016-03-15", "start"))).toBe("2016-03-15T00:00:00.000Z");
    expect(iso(parsePartialDateBound("2016-03-15", "end"))).toBe("2016-03-15T23:59:59.999Z");
  });

  it("returns undefined for empty / malformed / impossible input", () => {
    expect(parsePartialDateBound("", "start")).toBeUndefined();
    expect(parsePartialDateBound(undefined, "start")).toBeUndefined();
    expect(parsePartialDateBound("not-a-date", "start")).toBeUndefined();
    expect(parsePartialDateBound("2016-13", "start")).toBeUndefined(); // bad month
    expect(parsePartialDateBound("2016-02-30", "start")).toBeUndefined(); // bad day
    expect(parsePartialDateBound("20160315", "start")).toBeUndefined(); // no dashes
  });
});
