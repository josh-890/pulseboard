import { describe, expect, it } from "vitest";
import { attributeStatusFromCause } from "@/lib/services/person-service";

// ADR-0018: pure cause → AttributeStatus mapping (no DB). Mirrors the SQL fold
// CASE in app_recompute_person_current_state.
describe("attributeStatusFromCause (ADR-0018)", () => {
  it("AUGMENTATION → ENHANCED", () => {
    expect(attributeStatusFromCause("AUGMENTATION", true)).toBe("ENHANCED");
  });

  it("legacy SURGICAL → ENHANCED", () => {
    expect(attributeStatusFromCause("SURGICAL", true)).toBe("ENHANCED");
  });

  it("REDUCTION → REDUCED", () => {
    expect(attributeStatusFromCause("REDUCTION", true)).toBe("REDUCED");
  });

  it("REVERSAL → RESTORED", () => {
    expect(attributeStatusFromCause("REVERSAL", true)).toBe("RESTORED");
  });

  it("NATURAL winner with a surgical kind in history → RESTORED (overridden)", () => {
    expect(attributeStatusFromCause("NATURAL", true)).toBe("RESTORED");
  });

  it("NATURAL winner, no intervention history → NATURAL", () => {
    expect(attributeStatusFromCause("NATURAL", false)).toBe("NATURAL");
  });

  it("OTHER → NATURAL (no badge)", () => {
    expect(attributeStatusFromCause("OTHER", false)).toBe("NATURAL");
  });

  it("no winning delta → NATURAL", () => {
    expect(attributeStatusFromCause(undefined, false)).toBe("NATURAL");
  });
});
