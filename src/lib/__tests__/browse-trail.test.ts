import { describe, expect, it } from "vitest";
import {
  MAX_ENTRIES,
  TTL_MS,
  TRAIL_STORAGE_KEY,
  linkName,
  loadTrailEntry,
  parseEntityHref,
  parseTrailStore,
  saveTrailEntry,
  siblingHref,
  trailChain,
  trailNav,
  withVia,
  type KeyValueStorage,
  type TrailEntry,
} from "@/lib/browse-trail";

// The browse trail (2026-11-13): the list you came from travels with you.

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

function entry(id: string, over: Partial<TrailEntry> = {}): TrailEntry {
  return {
    id,
    title: `List ${id}`,
    returnHref: `/artists/a?tab=sets`,
    entityType: "person",
    ids: ["p1", "p2", "p3"],
    names: ["Anna", "Bea", "Cleo"],
    scrollY: 0,
    parentId: null,
    createdAt: 1_000,
    ...over,
  };
}

describe("parseEntityHref", () => {
  it("reads the entity kind and id from detail paths", () => {
    expect(parseEntityHref("/people/abc")).toEqual({ type: "person", id: "abc" });
    expect(parseEntityHref("/people/abc?tab=career&via=x")).toEqual({ type: "person", id: "abc" });
    expect(parseEntityHref("/sets/s1#top")).toEqual({ type: "set", id: "s1" });
    expect(parseEntityHref("/people/contacts/c1")).toEqual({ type: "contact", id: "c1" });
    expect(parseEntityHref("/channels/ch/")).toEqual({ type: "channel", id: "ch" });
  });

  it("ignores galleries, static routes and other links", () => {
    for (const href of ["/people", "/people/contacts", "/sessions/merge", "/sessions/rate", "/channels/check",
      "/collections/smart", "/people/contacts/runs", "/staging-sets?select=1", "https://x.test/people/a", null, "#x"]) {
      expect(parseEntityHref(href)).toBeNull();
    }
  });
});

describe("withVia / siblingHref", () => {
  it("sets, replaces and drops via, keeping the rest", () => {
    expect(withVia("/people/a", "t1")).toBe("/people/a?via=t1");
    expect(withVia("/people/a?tab=career&via=old#x", "t2")).toBe("/people/a?tab=career&via=t2#x");
    expect(withVia("/people/a?via=old", null)).toBe("/people/a");
  });

  it("keeps the tab when walking the list", () => {
    expect(siblingHref("person", "p2", "t1", "career")).toBe("/people/p2?tab=career&via=t1");
    expect(siblingHref("set", "s9", "t1", null)).toBe("/sets/s9?via=t1");
    expect(siblingHref("contact", "c1", "t1", null)).toBe("/people/contacts/c1?via=t1");
  });
});

describe("trailNav", () => {
  it("finds prev and next, and nothing past the ends", () => {
    const e = entry("t1");
    expect(trailNav(e, "p2")).toEqual({ index: 1, total: 3, prevId: "p1", prevName: "Anna", nextId: "p3", nextName: "Cleo" });
    expect(trailNav(e, "p1")).toMatchObject({ prevId: null, nextId: "p2" });
    expect(trailNav(e, "p3")).toMatchObject({ prevId: "p2", nextId: null });
  });

  it("is null for an entity not in the list", () => {
    expect(trailNav(entry("t1"), "zz")).toBeNull();
  });
});

describe("saveTrailEntry / loadTrailEntry", () => {
  it("stores by id and reads it back", () => {
    const s = memoryStorage();
    saveTrailEntry(entry("t1"), s, 2_000);
    expect(loadTrailEntry("t1", s)?.title).toBe("List t1");
    expect(loadTrailEntry("nope", s)).toBeNull();
  });

  it("keeps only the newest MAX_ENTRIES and drops expired ones", () => {
    const s = memoryStorage();
    const now = 10 * TTL_MS;
    saveTrailEntry(entry("old", { createdAt: now - TTL_MS - 1 }), s, now);
    for (let i = 0; i < MAX_ENTRIES + 5; i++) saveTrailEntry(entry(`e${i}`, { createdAt: now - 1000 + i }), s, now);
    const store = parseTrailStore(s.data.get(TRAIL_STORAGE_KEY) ?? null);
    expect(Object.keys(store)).toHaveLength(MAX_ENTRIES);
    expect(store.old).toBeUndefined();
    expect(store.e0).toBeUndefined();
    expect(store[`e${MAX_ENTRIES + 4}`]).toBeDefined();
  });

  it("survives broken storage content", () => {
    const s = memoryStorage();
    s.data.set(TRAIL_STORAGE_KEY, "{not json");
    expect(loadTrailEntry("t1", s)).toBeNull();
    saveTrailEntry(entry("t1"), s, 2_000);
    expect(loadTrailEntry("t1", s)).not.toBeNull();
  });
});

describe("trailChain", () => {
  it("climbs the parents, root first, capped and cycle-safe", () => {
    const store = {
      a: entry("a"),
      b: entry("b", { parentId: "a" }),
      c: entry("c", { parentId: "b" }),
      d: entry("d", { parentId: "c" }),
      e: entry("e", { parentId: "d" }),
      x: entry("x", { parentId: "y" }),
      y: entry("y", { parentId: "x" }),
    };
    expect(trailChain("c", store).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(trailChain("e", store).map((e) => e.id)).toEqual(["b", "c", "d", "e"]);
    expect(trailChain("x", store).map((e) => e.id)).toEqual(["y", "x"]);
    expect(trailChain("missing", store)).toEqual([]);
  });
});

describe("linkName", () => {
  const link = (dataset: Record<string, string>, attrs: Record<string, string>, text: string) => ({
    dataset,
    getAttribute: (n: string) => attrs[n] ?? null,
    textContent: text,
  });

  it("prefers data-trail-name, then aria-label, then the text", () => {
    expect(linkName(link({ trailName: "Anna" }, { "aria-label": "x" }, "y"))).toBe("Anna");
    expect(linkName(link({}, { "aria-label": "Bea (appearing)" }, "y"))).toBe("Bea (appearing)");
    expect(linkName(link({}, {}, "  Cleo \n  ICG-1  "))).toBe("Cleo ICG-1");
    expect(linkName(link({}, {}, "x".repeat(60)))).toHaveLength(40);
  });
});
