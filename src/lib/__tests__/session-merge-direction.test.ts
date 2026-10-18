import { describe, expect, it } from "vitest";
import { resolveMergeDirection } from "@/lib/session-merge-direction";

const at = (iso: string) => new Date(iso);
const facts = (id: string, f: { date?: string; release?: string; created?: string }) => ({
  id,
  date: f.date ? at(f.date) : null,
  earliestRelease: f.release ? at(f.release) : null,
  createdAt: at(f.created ?? "2026-01-01"),
});

describe("resolveMergeDirection — the older session stays", () => {
  it("decides by the session date, wherever the merge started", () => {
    const older = facts("old", { date: "2004-08-01" });
    const newer = facts("new", { date: "2004-09-01" });
    expect(resolveMergeDirection(newer, older)).toEqual({ survivorId: "old", absorbedId: "new", reason: "date" });
    expect(resolveMergeDirection(older, newer)).toEqual({ survivorId: "old", absorbedId: "new", reason: "date" });
  });

  it("falls back to the earliest set release when a date is missing or the same", () => {
    const a = facts("a", { release: "2005-03-01" });
    const b = facts("b", { date: "2004-01-01", release: "2005-01-01" });
    expect(resolveMergeDirection(a, b)).toEqual({ survivorId: "b", absorbedId: "a", reason: "set-release" });
    const sameDay = resolveMergeDirection(
      facts("x", { date: "2004-01-01", release: "2004-06-01" }),
      facts("y", { date: "2004-01-01", release: "2004-02-01" }),
    );
    expect(sameDay).toEqual({ survivorId: "y", absorbedId: "x", reason: "set-release" });
  });

  it("then by when the session was created, and keeps the starting one on a full tie", () => {
    expect(resolveMergeDirection(facts("a", { created: "2026-02-01" }), facts("b", { created: "2026-01-01" }))).toMatchObject({
      survivorId: "b",
      reason: "created",
    });
    expect(resolveMergeDirection(facts("a", {}), facts("b", {}))).toMatchObject({ survivorId: "a" });
  });

  it("accepts serialized dates", () => {
    const r = resolveMergeDirection(
      { id: "a", date: "2010-01-01T00:00:00.000Z", earliestRelease: null, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", date: "2009-01-01T00:00:00.000Z", earliestRelease: null, createdAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(r.survivorId).toBe("b");
  });
});
