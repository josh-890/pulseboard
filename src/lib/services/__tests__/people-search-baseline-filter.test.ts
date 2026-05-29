import { describe, expect, it } from "vitest";
import { specFromUrlParams, specToUrlParams } from "@/lib/types/filter-spec";

// Slice 16 Step 4 / ADR-0008 principle 4: baseline-presence sub-filter wiring.
// URL ↔ spec round-trip tests. The SQL clause is exercised end-to-end via
// the search service against PersonCurrentState.baselineAttributes.

function paramsFrom(record: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) p.set(k, v);
  return p;
}

describe("AttributeBaselinePresence filter URL round-trip", () => {
  it("serializes a baseline-only filter", () => {
    const params = specToUrlParams({
      categorical: [], range: [], presence: [], region: [], text: [],
      attribute: [
        { definitionId: "cattr-breast-size", values: [], baselinePresence: "missing" },
      ],
      timeScope: "current",
    });
    expect(params.get("attr.cattr-breast-size.baseline")).toBe("missing");
    expect(params.has("attr.cattr-breast-size")).toBe(false);
  });

  it("parses baseline=missing from URL", () => {
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-breast-size.baseline": "missing",
    }));
    expect(spec.attribute).toHaveLength(1);
    expect(spec.attribute[0]?.baselinePresence).toBe("missing");
  });

  it("parses baseline=has from URL", () => {
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-weight.baseline": "has",
    }));
    expect(spec.attribute[0]?.baselinePresence).toBe("has");
  });

  it("rejects invalid baseline values silently", () => {
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-breast-size.baseline": "whatever",
    }));
    expect(spec.attribute).toHaveLength(0);
  });

  it("combines values, status, and baselinePresence on one attribute", () => {
    const before = {
      categorical: [], range: [], presence: [], region: [], text: [],
      attribute: [
        {
          definitionId: "cattr-breast-size",
          values: ["B"],
          status: "ENHANCED" as const,
          baselinePresence: "missing" as const,
        },
      ],
      timeScope: "current" as const,
    };
    const after = specFromUrlParams(specToUrlParams(before));
    const entry = after.attribute[0];
    expect(entry?.values).toEqual(["B"]);
    expect(entry?.status).toBe("ENHANCED");
    expect(entry?.baselinePresence).toBe("missing");
  });

  it("an attribute with only baselinePresence survives the empty-filter prune", () => {
    // Slice 16 Step 4: previously an attribute entry with no values/range/status
    // would be filtered out by specFromUrlParams. Adding baselinePresence as a
    // first-class filter dimension means it must keep its entry alive too.
    const spec = specFromUrlParams(paramsFrom({
      "attr.cattr-bust-chest.baseline": "missing",
    }));
    expect(spec.attribute).toHaveLength(1);
    expect(spec.attribute[0]?.definitionId).toBe("cattr-bust-chest");
    expect(spec.attribute[0]?.baselinePresence).toBe("missing");
  });
});
