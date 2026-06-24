import { describe, expect, it } from "vitest";
import {
  contributorKindForRoleGroup,
  mergeSessionContributors,
  type PersonContributor,
  type BehindCameraCredit,
} from "@/lib/services/session-contributors";

/**
 * ADR-0021 Phase 0: pin the role-group → contributor-kind rule and the session
 * contributor union/dedup before any reader uses them.
 */
describe("contributorKindForRoleGroup", () => {
  it("maps Behind Camera → artist", () => {
    expect(contributorKindForRoleGroup("Behind Camera")).toBe("artist");
  });

  it("maps On-Camera (and anything else) → person", () => {
    expect(contributorKindForRoleGroup("On-Camera")).toBe("person");
    expect(contributorKindForRoleGroup("Cast")).toBe("person");
  });
});

describe("mergeSessionContributors", () => {
  const person = (over: Partial<PersonContributor> = {}): PersonContributor => ({
    kind: "person",
    personId: "p1",
    roleName: "model",
    displayName: "Mira",
    ...over,
  });
  const credit = (over: Partial<BehindCameraCredit> = {}): BehindCameraCredit => ({
    artistId: null,
    resolvedArtistName: null,
    rawName: "J. Doe",
    roleName: "photographer",
    ...over,
  });

  it("keeps Persons first, behind-camera Artists after", () => {
    const out = mergeSessionContributors([person()], [credit({ artistId: "a1", resolvedArtistName: "J. Doe" })]);
    expect(out.map((c) => c.kind)).toEqual(["person", "artist"]);
  });

  it("shows a resolved Artist by name", () => {
    const out = mergeSessionContributors([], [credit({ artistId: "a1", resolvedArtistName: "Jane Doe" })]);
    expect(out[0]).toMatchObject({ kind: "artist", displayName: "Jane Doe", artistId: "a1" });
  });

  it("shows an UNRESOLVED behind-camera credit by raw name", () => {
    const out = mergeSessionContributors([], [credit({ rawName: "Some Photog" })]);
    expect(out[0]).toMatchObject({ kind: "artist", displayName: "Some Photog", artistId: null });
  });

  it("dedupes the same resolved Artist appearing on two sets (same role)", () => {
    const c = credit({ artistId: "a1", resolvedArtistName: "Jane" });
    expect(mergeSessionContributors([], [c, { ...c }])).toHaveLength(1);
  });

  it("dedupes unresolved credits by normalized raw name", () => {
    expect(
      mergeSessionContributors([], [credit({ rawName: "Jane Doe" }), credit({ rawName: "  jane doe " })]),
    ).toHaveLength(1);
  });

  it("does NOT merge the same name across different roles", () => {
    const out = mergeSessionContributors(
      [],
      [credit({ artistId: "a1", roleName: "photographer" }), credit({ artistId: "a1", roleName: "videographer" })],
    );
    expect(out).toHaveLength(2);
  });

  it("treats a resolved artist and a same-name raw credit as distinct (artistId vs raw)", () => {
    const out = mergeSessionContributors(
      [],
      [credit({ artistId: "a1", resolvedArtistName: "Jane" }), credit({ rawName: "Jane" })],
    );
    expect(out).toHaveLength(2);
  });
});
