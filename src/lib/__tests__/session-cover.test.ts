import { describe, expect, it } from "vitest";
import { sessionCoverSource, sessionSetsInCoverOrder, type SessionCoverSet } from "@/lib/session-cover";

// Which cover a session shows (ADR-0040)
const set = (id: string, o: Partial<SessionCoverSet> = {}): SessionCoverSet => ({
  id,
  title: id,
  coverMediaItemId: `${id}-cover`,
  isPrimary: true,
  releaseDate: null,
  createdAt: "2026-01-01",
  ...o,
});

describe("sessionSetsInCoverOrder", () => {
  it("primary first, then the earliest release, then the earliest created; no date last", () => {
    const order = sessionSetsInCoverOrder([
      set("late", { releaseDate: "2020-05-01" }),
      set("nodate", { createdAt: "2019-01-01" }),
      set("compilation", { isPrimary: false, releaseDate: "2010-01-01" }),
      set("early", { releaseDate: "2018-03-01" }),
      set("early-twin", { releaseDate: "2018-03-01", createdAt: "2025-01-01" }),
    ]).map((s) => s.id);
    expect(order).toEqual(["early-twin", "early", "late", "nodate", "compilation"]);
  });
});

describe("sessionCoverSource", () => {
  it("its own pick wins", () => {
    expect(sessionCoverSource("mine", [set("a")])).toEqual({ kind: "own", mediaItemId: "mine" });
  });
  it("else the first-released primary set with a cover", () => {
    const r = sessionCoverSource(null, [
      set("b", { releaseDate: "2021-01-01" }),
      set("a", { releaseDate: "2019-01-01", coverMediaItemId: null }),
      set("c", { releaseDate: "2020-01-01" }),
    ]);
    expect(r.kind === "set" && r.set.id).toBe("c");
  });
  it("a set this session is not the primary session of does not count", () => {
    expect(sessionCoverSource(null, [set("x", { isPrimary: false })])).toEqual({ kind: "none" });
  });
});
