import { describe, expect, it } from "vitest";
import { moveToFront } from "@/lib/services/media-service";

describe("moveToFront", () => {
  it("moves a middle id to the front, preserving the rest order", () => {
    expect(moveToFront(["a", "b", "c", "d"], "c")).toEqual(["c", "a", "b", "d"]);
  });

  it("is a no-op when the id is already first", () => {
    expect(moveToFront(["a", "b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("moves the last id to the front", () => {
    expect(moveToFront(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("returns a copy unchanged when the id is absent", () => {
    const input = ["a", "b"];
    const out = moveToFront(input, "z");
    expect(out).toEqual(["a", "b"]);
    expect(out).not.toBe(input);
  });

  it("handles a single-element list", () => {
    expect(moveToFront(["a"], "a")).toEqual(["a"]);
  });
});
