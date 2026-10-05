import { describe, expect, it } from "vitest";
import {
  canonicalTagMarker,
  parseTagMarker,
  reconcileTagSet,
  resolveTagMarkers,
} from "@/lib/archive-tags";
import type { CatalogTag } from "@/lib/tag-query";

const tag = (id: string, name: string, groupSlug: string, opts: Partial<CatalogTag> = {}): CatalogTag => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  aliases: [],
  parentId: null,
  groupId: `g-${groupSlug}`,
  groupSlug,
  groupName: groupSlug[0].toUpperCase() + groupSlug.slice(1),
  isExclusive: false,
  kind: "DESCRIPTIVE",
  domain: "CONTENT",
  ...opts,
});

const CATALOG: CatalogTag[] = [
  tag("out", "Outdoor", "setting", { isExclusive: true, aliases: ["outdoors"] }),
  tag("in", "Indoor", "setting", { isExclusive: true }),
  tag("bik", "Bikini", "outfit"),
  tag("glow-l", "Glow", "light"),
  tag("glow-m", "Glow", "mood"),
  tag("fit", "Fitness", "traits", { domain: "PERSON" }),
  tag("todo", "upload-HD", "workflow", { domain: "ANY", kind: "WORKFLOW" }),
  tag("bw", "B/W", "light"),
];

describe("parseTagMarker", () => {
  it("reads names, an optional group, extensions and underscores", () => {
    expect(parseTagMarker("#Outdoor")).toEqual({ raw: "#Outdoor", group: null, name: "outdoor" });
    expect(parseTagMarker("#outfit=Bikini.txt")).toEqual({ raw: "#outfit=Bikini", group: "outfit", name: "bikini" });
    expect(parseTagMarker("#golden_hour")).toMatchObject({ name: "golden hour" });
  });

  it("ignores what is not a tag marker", () => {
    expect(parseTagMarker("STUB")).toBeNull();
    expect(parseTagMarker("Jane Doe (AB-1234)")).toBeNull();
    expect(parseTagMarker("#")).toBeNull();
    expect(parseTagMarker("#=bikini")).toBeNull();
  });
});

describe("resolveTagMarkers", () => {
  it("resolves names, aliases and qualified names", () => {
    expect(resolveTagMarkers(["#outdoors", "#outfit=bikini.txt", "#UPLOAD-HD"], CATALOG)).toMatchObject({
      ids: ["out", "bik", "todo"],
      unknown: [],
      conflicts: [],
    });
  });

  it("keeps ambiguous, unknown and wrong-domain markers as unknown", () => {
    const r = resolveTagMarkers(["#glow", "#outdor", "#fitness", "#light=glow"], CATALOG);
    expect(r.ids).toEqual(["glow-l"]);
    expect(r.unknown).toEqual(["#glow", "#outdor", "#fitness"]);
  });

  it("leaves an exclusive group with two markers out, reporting both", () => {
    const r = resolveTagMarkers(["#indoor", "#outdoor", "#bikini"], CATALOG);
    expect(r.ids).toEqual(["bik"]);
    expect(r.conflicts).toEqual(["#indoor", "#outdoor"]);
    expect(r.conflictGroupIds).toEqual(["g-setting"]);
  });
});

describe("canonicalTagMarker", () => {
  it("uses the bare name when unique, the group when shared, the slug when Windows cannot store it", () => {
    expect(canonicalTagMarker(CATALOG[0], CATALOG)).toBe("#Outdoor");
    expect(canonicalTagMarker(CATALOG[3], CATALOG)).toBe("#light=Glow");
    expect(canonicalTagMarker(CATALOG[7], CATALOG)).toBe("#b-w");
  });
});

describe("reconcileTagSet (ADR-0032 rule per tag)", () => {
  it("adopts a marker added on disk", () => {
    expect(reconcileTagSet({ diskNow: ["a"], lastSeen: [], appNow: [] })).toMatchObject({ appAdd: ["a"], appRemove: [], diskWanted: ["a"] });
  });

  it("drops a tag whose marker was deleted on disk", () => {
    expect(reconcileTagSet({ diskNow: [], lastSeen: ["a"], appNow: ["a"] })).toMatchObject({ appAdd: [], appRemove: ["a"], diskWanted: [] });
  });

  it("writes a tag added in the app, and removes one dropped in the app", () => {
    expect(reconcileTagSet({ diskNow: ["b"], lastSeen: ["b"], appNow: ["a"] })).toMatchObject({
      appAdd: [],
      appRemove: [],
      diskWanted: ["a"],
    });
  });

  it("agrees when both sides made the same change", () => {
    expect(reconcileTagSet({ diskNow: ["a"], lastSeen: [], appNow: ["a"] })).toMatchObject({ appAdd: [], appRemove: [], diskWanted: ["a"] });
    expect(reconcileTagSet({ diskNow: [], lastSeen: ["a"], appNow: [] })).toMatchObject({ appAdd: [], appRemove: [], diskWanted: [] });
  });

  it("unites both sides when the disk was never reported", () => {
    const r = reconcileTagSet({ diskNow: ["a"], lastSeen: null, appNow: ["b"] });
    expect(r.appAdd).toEqual(["a"]);
    expect(r.appRemove).toEqual([]);
    expect(r.diskWanted.sort()).toEqual(["a", "b"]);
    expect(r.lastSeenNext).toEqual(["a"]);
  });
});
