import { describe, expect, it } from "vitest";
import { formatMeasurements } from "@/lib/utils/measurements";

describe("formatMeasurements", () => {
  it("formats structured Bust-Waist-Hips when all three present", () => {
    expect(
      formatMeasurements({ bust: 88, waist: 62, hips: 90, textFallback: null }),
    ).toBe("88-62-90");
  });

  it("accepts string numeric inputs (matches what currentAttributes JSONB returns)", () => {
    expect(
      formatMeasurements({ bust: "88", waist: "62", hips: "90", textFallback: null }),
    ).toBe("88-62-90");
  });

  it("falls back to TEXT when any structured value is missing", () => {
    expect(
      formatMeasurements({
        bust: 88,
        waist: null,
        hips: 90,
        textFallback: "86C-66-87 / 34C-26-34",
      }),
    ).toBe("86C-66-87 / 34C-26-34");
  });

  it("falls back to TEXT when all structured values are missing", () => {
    expect(
      formatMeasurements({
        bust: null,
        waist: null,
        hips: null,
        textFallback: "raw measurements",
      }),
    ).toBe("raw measurements");
  });

  it("returns null when nothing is available", () => {
    expect(
      formatMeasurements({ bust: null, waist: null, hips: null, textFallback: null }),
    ).toBeNull();
    expect(
      formatMeasurements({ bust: "", waist: "", hips: "", textFallback: "" }),
    ).toBeNull();
  });

  it("ignores non-numeric strings in structured slots", () => {
    expect(
      formatMeasurements({ bust: "abc", waist: 62, hips: 90, textFallback: "text" }),
    ).toBe("text");
  });

  it("renders decimals to 1 place; integers without a decimal", () => {
    expect(
      formatMeasurements({ bust: 88.5, waist: 62, hips: 90.0, textFallback: null }),
    ).toBe("88.5-62-90");
  });

  it("prefers structured over TEXT when both are present", () => {
    expect(
      formatMeasurements({ bust: 88, waist: 62, hips: 90, textFallback: "garbage" }),
    ).toBe("88-62-90");
  });
});
