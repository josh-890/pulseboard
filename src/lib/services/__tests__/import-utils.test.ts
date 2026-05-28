import { describe, expect, it } from "vitest";
import {
  chooseNaturalCup,
  extractCupFromMeasurements,
  parseBreastDescription,
} from "@/lib/services/import/import-utils";

describe("parseBreastDescription", () => {
  it("recognises (Real) / (Natural) as natural", () => {
    expect(parseBreastDescription("Medium (Real)").status).toBe("natural");
    expect(parseBreastDescription("small (Natural)").status).toBe("natural");
  });

  it("recognises (Fake) / (Enhanced) / (Implants) / (Augmented) as enhanced", () => {
    for (const word of ["Fake", "Enhanced", "Implants", "Implant", "Augmented"]) {
      expect(parseBreastDescription(`Large (${word})`).status).toBe("enhanced");
    }
  });

  it("falls back to natural when no parenthetical is present", () => {
    expect(parseBreastDescription("Medium").status).toBe("natural");
  });

  it("maps size words to cup letters", () => {
    expect(parseBreastDescription("Small (Real)").cupSize).toBe("B");
    expect(parseBreastDescription("Large (Fake)").cupSize).toBe("DD");
    expect(parseBreastDescription("Medium-Large (Real)").cupSize).toBe("D");
  });
});

describe("extractCupFromMeasurements", () => {
  it("extracts the cup letter from a hyphen-separated triplet", () => {
    expect(extractCupFromMeasurements("34D-23-35")).toBe("D");
    expect(extractCupFromMeasurements("86C-66-87")).toBe("C");
  });

  it("extracts double-letter cups", () => {
    expect(extractCupFromMeasurements("34DD-24-34")).toBe("DD");
  });

  it("returns null when no cup letter is present", () => {
    expect(extractCupFromMeasurements("86-66-87")).toBeNull();
  });
});

describe("chooseNaturalCup (ADR-0008 principle 4)", () => {
  it("returns the cup as natural when the source signals natural", () => {
    expect(chooseNaturalCup("C", "natural")).toBe("C");
    expect(chooseNaturalCup("D", "natural")).toBe("D");
  });

  it("returns the cup as natural when no breast description was parsed", () => {
    // measurements-only path: no status signal, treat as baseline best-guess
    expect(chooseNaturalCup("B", null)).toBe("B");
  });

  it("returns null when the source signals enhanced", () => {
    // The cup we have reflects the post-enhancement state — baseline stays
    // empty so the case is searchable as "natural breast size unknown".
    expect(chooseNaturalCup("D", "enhanced")).toBeNull();
    expect(chooseNaturalCup("DD", "enhanced")).toBeNull();
  });

  it("returns null when no cup is extractable, regardless of status", () => {
    expect(chooseNaturalCup(null, "natural")).toBeNull();
    expect(chooseNaturalCup(null, "enhanced")).toBeNull();
    expect(chooseNaturalCup(null, null)).toBeNull();
  });
});
