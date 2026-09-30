import { describe, expect, it } from "vitest";
import { isStubMarkerName, reconcileStub, toArchiveStub } from "@/lib/archive-stub";

describe("isStubMarkerName", () => {
  it("accepts STUB with any case and any extension", () => {
    for (const n of ["STUB", "stub", "STUB.txt", "Stub.TXT", " STUB "]) expect(isStubMarkerName(n), n).toBe(true);
  });

  it("rejects everything else in .pulseboard\\", () => {
    for (const n of ["pulseboard.json", "cast.json", "Iveta_C_(IC-87VY)", "STUBBED", "NOSTUB.txt", ""]) {
      expect(isStubMarkerName(n), n).toBe(false);
    }
  });
});

describe("reconcileStub", () => {
  it("nothing moved: nothing happens", () => {
    expect(reconcileStub({ diskNow: true, lastSeen: true, appNow: true })).toMatchObject({ appNext: true, source: "none" });
    expect(reconcileStub({ diskNow: false, lastSeen: false, appNow: false })).toMatchObject({ appNext: false, source: "none" });
  });

  it("STUB dropped on disk → the app marks the folder", () => {
    expect(reconcileStub({ diskNow: true, lastSeen: false, appNow: false }))
      .toEqual({ appNext: true, diskWanted: true, lastSeenNext: true, source: "disk" });
  });

  it("STUB deleted on disk → the stub ends in the app", () => {
    expect(reconcileStub({ diskNow: false, lastSeen: true, appNow: true }))
      .toEqual({ appNext: false, diskWanted: false, lastSeenNext: false, source: "disk" });
  });

  it("ended in the app → the agent is asked to remove STUB", () => {
    expect(reconcileStub({ diskNow: true, lastSeen: true, appNow: false }))
      .toEqual({ appNext: false, diskWanted: false, lastSeenNext: true, source: "app" });
  });

  it("marked in the app → the agent is asked to write STUB", () => {
    expect(reconcileStub({ diskNow: false, lastSeen: false, appNow: true }))
      .toEqual({ appNext: true, diskWanted: true, lastSeenNext: false, source: "app" });
  });

  it("both sides moved the same way: they agree, nothing to write", () => {
    expect(reconcileStub({ diskNow: false, lastSeen: true, appNow: false }))
      .toEqual({ appNext: false, diskWanted: false, lastSeenNext: false, source: "both" });
  });

  it("before the first report a stub on either side is a stub", () => {
    expect(reconcileStub({ diskNow: true, lastSeen: null, appNow: false })).toMatchObject({ appNext: true, source: "disk" });
    expect(reconcileStub({ diskNow: false, lastSeen: null, appNow: true })).toMatchObject({ appNext: true, diskWanted: true, source: "app" });
    expect(reconcileStub({ diskNow: false, lastSeen: null, appNow: false })).toMatchObject({ appNext: false, source: "none" });
  });
});

describe("toArchiveStub", () => {
  it("is null for a normal folder", () => {
    expect(toArchiveStub({ stubSince: null, stubReason: null, stubNote: null })).toBeNull();
  });

  it("describes a stub", () => {
    const since = new Date("2026-09-30T00:00:00Z");
    expect(toArchiveStub({ stubSince: since, stubReason: "FEW_MEDIA", stubNote: "12 of 80" }))
      .toEqual({ since, reason: "FEW_MEDIA", note: "12 of 80" });
  });
});
