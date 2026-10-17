import { describe, expect, it } from "vitest";
import { markCascade } from "@/lib/media-mark-tiers";

// outtake < ★ < iconic (2026-10-17): setting sets the lower ones, clearing clears the higher ones

describe("markCascade", () => {
  it("setting a mark sets every lower one", () => {
    expect(markCascade("iconic", true)).toEqual({ outtake: true, favorite: true, iconic: true });
    expect(markCascade("favorite", true)).toEqual({ outtake: true, favorite: true });
    expect(markCascade("outtake", true)).toEqual({ outtake: true });
  });

  it("clearing a mark clears every higher one", () => {
    expect(markCascade("outtake", false)).toEqual({ outtake: false, favorite: false, iconic: false });
    expect(markCascade("favorite", false)).toEqual({ favorite: false, iconic: false });
    expect(markCascade("iconic", false)).toEqual({ iconic: false });
  });
});
