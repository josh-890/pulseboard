import { describe, expect, it } from "vitest";
import {
  MAX_RECENT,
  RECENT_STORAGE_KEY,
  addRecent,
  clearRecent,
  parseRecent,
  recentHref,
  recordRecent,
  type RecentItem,
} from "@/lib/recently-viewed";
import type { KeyValueStorage } from "@/lib/browse-trail";

// Recently viewed (2026-11-13): the last detail pages opened, newest first.

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const item = (id: string, at = 1): RecentItem => ({ type: "person", id, name: `P ${id}`, at });

describe("addRecent", () => {
  it("puts the newest first and moves a revisit to the front", () => {
    let list = addRecent([], item("a"));
    list = addRecent(list, item("b"));
    list = addRecent(list, item("a", 3));
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(list[0]!.at).toBe(3);
  });

  it("keeps the same id of another kind apart", () => {
    const list = addRecent([item("x")], { type: "set", id: "x", name: "S", at: 2 });
    expect(list).toHaveLength(2);
  });

  it("keeps only MAX_RECENT", () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < MAX_RECENT + 4; i++) list = addRecent(list, item(`p${i}`));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]!.id).toBe(`p${MAX_RECENT + 3}`);
  });
});

describe("parseRecent / recordRecent", () => {
  it("drops broken content and unknown kinds", () => {
    expect(parseRecent("{nope")).toEqual([]);
    expect(parseRecent(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseRecent(JSON.stringify([item("a"), { type: "planet", id: "x", name: "X", at: 1 }, null]))).toHaveLength(1);
  });

  it("records into storage and clears", () => {
    const s = memoryStorage();
    recordRecent({ type: "channel", id: "c1", name: "FemJoy" }, s, 5);
    recordRecent({ type: "person", id: "p1", name: "Anna (ICG-1)" }, s, 6);
    expect(parseRecent(s.data.get(RECENT_STORAGE_KEY) ?? null).map((x) => x.name)).toEqual(["Anna (ICG-1)", "FemJoy"]);
    clearRecent(s);
    expect(parseRecent(s.data.get(RECENT_STORAGE_KEY) ?? null)).toEqual([]);
  });
});

describe("recentHref", () => {
  it("builds the detail path", () => {
    expect(recentHref({ type: "contact", id: "c1" })).toBe("/people/contacts/c1");
    expect(recentHref({ type: "set", id: "s1" })).toBe("/sets/s1");
  });
});
