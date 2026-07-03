import { describe, expect, it } from "vitest";
import { resolveCreditedAs } from "@/lib/sets/credited-as";

describe("resolveCreditedAs", () => {
  it("prefers the pinned alias's current name", () => {
    expect(
      resolveCreditedAs({ rawName: "Mila", resolvedAlias: { name: "Milla" } }, "Wiska"),
    ).toBe("Milla");
  });

  it("suppresses the line when the pinned alias equals the common name", () => {
    expect(
      resolveCreditedAs({ rawName: "Mila", resolvedAlias: { name: "Wiska" } }, "Wiska"),
    ).toBeNull();
  });

  it("does NOT fall through to rawName when a pin exists but equals common", () => {
    // Pin is authoritative: the set is credited under the common name.
    expect(
      resolveCreditedAs({ rawName: "Mila", resolvedAlias: { name: "Wiska" } }, "Wiska"),
    ).toBeNull();
  });

  it("falls back to the raw string when unpinned and it differs from common", () => {
    expect(
      resolveCreditedAs({ rawName: "Mila", resolvedAlias: null }, "Wiska"),
    ).toBe("Mila");
  });

  it("shows nothing when the raw string equals the common name", () => {
    expect(
      resolveCreditedAs({ rawName: "Wiska", resolvedAlias: null }, "Wiska"),
    ).toBeNull();
  });

  it("shows nothing when there is no evidence at all", () => {
    expect(resolveCreditedAs({ rawName: null, resolvedAlias: null }, "Wiska")).toBeNull();
  });

  it("shows the raw string even when common name is unknown (null)", () => {
    expect(resolveCreditedAs({ rawName: "Mila", resolvedAlias: null }, null)).toBe("Mila");
  });
});
