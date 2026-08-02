import { describe, expect, it } from "vitest";
import { escapeLike } from "@/lib/prisma-like";

describe("escapeLike", () => {
  it("doubles backslashes so Windows paths match literally", () => {
    // The bug this exists for: LIKE treats \ as its escape character, so the raw
    // path matched 0 of 11,506 rows.
    expect(escapeLike("I:\\Sites\\FJ-FemJoy")).toBe("I:\\\\Sites\\\\FJ-FemJoy");
  });

  it("escapes the LIKE wildcards", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes the backslash before the wildcards, not after", () => {
    // Escaping % first would produce \% and the backslash pass would then turn
    // that into \\%, i.e. a literal backslash followed by a live wildcard.
    expect(escapeLike("a\\%b")).toBe("a\\\\\\%b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLike("FJ-FemJoy 2016")).toBe("FJ-FemJoy 2016");
    expect(escapeLike("")).toBe("");
  });

  it("is idempotent in effect — escaping an escaped value stays literal", () => {
    // Not equal (each pass adds a level), but it must never produce a live
    // wildcard, which is the property that matters.
    const twice = escapeLike(escapeLike("a_b"));
    expect(twice.includes("\\_")).toBe(true);
  });
});
