import { describe, expect, it } from "vitest";
import {
  isSkippableEmptyLeaf,
  shouldSkipEmptyUpdate,
} from "@/lib/services/archive-service";

const emptyLeaf = { contentSignature: "empty" as string | null, fileCount: 0 as number | null };

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

  it("does NOT skip a videoset whose video is present (no extracted frames yet)", () => {
    // frames\ drives fileCount/signature, so a video-only folder looks 'empty'.
    expect(isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0, isVideo: true, videoPresent: true })).toBe(false);
    // videoPresent false but a video file is listed → still not empty.
    expect(isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0, isVideo: true, videoPresent: false, videoFiles: ["clip.mp4"] })).toBe(false);
    expect(isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0, isVideo: true, videoFiles: '["clip.mp4"]' })).toBe(false);
  });

  it("still skips a videoset folder with no video and no frames", () => {
    expect(isSkippableEmptyLeaf({ contentSignature: "empty", fileCount: 0, isVideo: true, videoPresent: false, videoFiles: [] })).toBe(true);
  });
});

describe("shouldSkipEmptyUpdate", () => {
  it("does not skip when the incoming leaf isn't a skippable empty leaf", () => {
    // has content
    expect(
      shouldSkipEmptyUpdate({ contentSignature: "sig", fileCount: 5 }, { fileCount: 5, contentSignature: "sig" }),
    ).toBe(false);
    // empty but carries a sidecarKey (tracked / moved)
    expect(
      shouldSkipEmptyUpdate({ ...emptyLeaf, sidecarKey: "K" }, { fileCount: 9, contentSignature: "sig" }),
    ).toBe(false);
  });

  it("skips when no record is at the path anymore (real folder moved away this scan)", () => {
    expect(shouldSkipEmptyUpdate(emptyLeaf, null)).toBe(true);
  });

  it("skips when the stored record still holds content (backup ghost at old path)", () => {
    expect(shouldSkipEmptyUpdate(emptyLeaf, { fileCount: 42, contentSignature: "sig" })).toBe(true);
    expect(shouldSkipEmptyUpdate(emptyLeaf, { fileCount: null, contentSignature: "sig" })).toBe(true);
  });

  it("does NOT skip when the stored record was already empty (let it refresh / stay seen)", () => {
    expect(shouldSkipEmptyUpdate(emptyLeaf, { fileCount: 0, contentSignature: "empty" })).toBe(false);
    expect(shouldSkipEmptyUpdate(emptyLeaf, { fileCount: 0, contentSignature: null })).toBe(false);
  });
});
