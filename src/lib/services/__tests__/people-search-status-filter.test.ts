import { describe, expect, it } from "vitest";
import { specFromUrlParams, specToUrlParams } from "@/lib/types/filter-spec";

// Slice 6 (ADR-0007): AttributeStatus sub-filter wiring.
// Pure unit tests on the URL ↔ spec round-trip. The SQL clause itself is
// asserted via Playwright (`people-status-filter.spec.ts`) hitting a known
// person with breast_size=ENHANCED in dev.

describe("AttributeStatus filter URL round-trip", () => {
  function paramsFrom(record: Record<string, string>): URLSearchParams {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(record)) p.set(k, v);
    return p;
  }

  it("serializes a status-only filter (no value, no range)", () => {
    const params = specToUrlParams({
      categorical: [], range: [], presence: [], region: [], text: [],
      attribute: [
        { definitionId: "cattr-breast-size", values: [], status: "ENHANCED" },
      ],
      timeScope: "current",
    });
    expect(params.get("attr.cattr-breast-size.status")).toBe("ENHANCED");
    expect(params.has("attr.cattr-breast-size")).toBe(false); // no values
  });

  it("parses status from URL and produces the right AttributeFilter entry", () => {
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-breast-size.status": "NATURAL",
    }));
    expect(spec.attribute).toHaveLength(1);
    expect(spec.attribute[0]?.status).toBe("NATURAL");
    expect(spec.attribute[0]?.values).toEqual([]);
  });

  it("parses combined values + status", () => {
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-breast-size": "B,C",
      "attr.cattr-breast-size.status": "ENHANCED",
    }));
    expect(spec.attribute[0]?.values).toEqual(["B", "C"]);
    expect(spec.attribute[0]?.status).toBe("ENHANCED");
  });

  it("rejects invalid status values silently", () => {
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-breast-size.status": "INVALID",
    }));
    // No values + invalid status → entry filtered out
    expect(spec.attribute).toHaveLength(0);
  });

  it("round-trips a multi-attribute spec with mixed filters", () => {
    const before = {
      categorical: [], range: [], presence: [], region: [], text: [],
      attribute: [
        { definitionId: "cattr-weight", values: [], min: 50, max: 70 },
        { definitionId: "cattr-breast-size", values: ["B"], status: "ENHANCED" as const },
      ],
      timeScope: "current" as const,
    };
    const after = specFromUrlParams(specToUrlParams(before));
    expect(after.attribute).toHaveLength(2);
    const breast = after.attribute.find((a) => a.definitionId === "cattr-breast-size");
    expect(breast?.status).toBe("ENHANCED");
    expect(breast?.values).toEqual(["B"]);
    const weight = after.attribute.find((a) => a.definitionId === "cattr-weight");
    expect(weight?.min).toBe(50);
    expect(weight?.max).toBe(70);
  });
});
