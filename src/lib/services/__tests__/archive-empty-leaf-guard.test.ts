import { describe, expect, it } from "vitest";
import { isSkippableEmptyLeaf } from "@/lib/services/archive-service";

describe("isSkippableEmptyLeaf", () => {
  it("skips a confirmed-empty leaf with no sidecarKey", () => {
    expect(isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0 })).toBe(true);
    expect(isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0, sidecarKey: null })).toBe(true);
  });

  it("never skips when a sidecarKey is present (tracked / moved with its sidecar)", () => {
    expect(
      isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0, sidecarKey: "K" }),
    ).toBe(false);
  });

  it("never skips a leaf with content", () => {
    expect(isSkippableEmptyLeaf({ contentSignature: "a1b2c3", fileCount: 12 })).toBe(false);
    // A lone non-image file still counts as content (e.g. a photoset folder holding
    // only its _pulseboard.json is fileCount=1, signature != 'empty').
    expect(isSkippableEmptyLeaf({ contentSignature: "deadbeef", fileCount: 1 })).toBe(false);
  });

  it("treats fileCount 0 as empty even if signature is missing", () => {
    expect(isSkippableEmptyLeaf({ contentSignature: null, fileCount: 0 })).toBe(true);
  });

  it("does NOT treat an unreadable leaf (fileCount null, signature not 'empty') as empty", () => {
    expect(isSkippableEmptyLeaf({ contentSignature: null, fileCount: null })).toBe(false);
  });
});
