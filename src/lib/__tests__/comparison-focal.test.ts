import { describe, expect, it } from "vitest";
import {
  axisOffset,
  coverObjectPosition,
  coverScale,
  dragAxis,
  focalAfterDrag,
  focalInCell,
  photoPointAt,
} from "@/lib/comparison-focal";

// A 3:2 landscape photo in a 2:3 portrait cell: covers at 2.25 cells wide
const LAND = 3 / 2;
const PORT = 2 / 3;

describe("comparison framing", () => {
  it("overflows along one axis only", () => {
    expect(coverScale(LAND, PORT)).toEqual({ rx: 2.25, ry: 1 });
    expect(dragAxis(LAND, PORT)).toBe("x");
    expect(dragAxis(PORT, LAND)).toBe("y");
    expect(dragAxis(PORT, PORT)).toBeNull();
  });

  it("centres the focal point — that is where the marker shows", () => {
    const at = focalInCell({ x: 0.5, y: 0.5 }, LAND, PORT);
    expect(at.x).toBeCloseTo(0.5);
    const off = focalInCell({ x: 0.4, y: 0.5 }, LAND, PORT);
    expect(off.x).toBeCloseTo(0.5);
  });

  it("holds at the edges: a point near the photo's border is not centred", () => {
    expect(axisOffset(0, 2.25)).toBe(0);
    expect(axisOffset(1, 2.25)).toBeCloseTo(-1.25);
    expect(focalInCell({ x: 0, y: 0.5 }, LAND, PORT).x).toBeCloseTo(0);
    expect(coverObjectPosition({ x: 0, y: 0.5 }, LAND, PORT)).toBe("0% 50%");
    expect(coverObjectPosition({ x: 1, y: 0.5 }, LAND, PORT)).toBe("100% 50%");
  });

  it("a click centres what was clicked", () => {
    const start = { x: 0.5, y: 0.5 };
    const clicked = photoPointAt(0.8, 0.3, start, LAND, PORT);
    // Rendering the clicked point brings it to the centre
    expect(focalInCell(clicked, LAND, PORT).x).toBeCloseTo(0.5);
    // The clicked photo point is the one that was under the cursor
    expect(focalInCell(start, LAND, PORT).x + (clicked.x - start.x) * 2.25).toBeCloseTo(0.8);
  });

  it("a drag moves the photo with the cursor and stops at the edge", () => {
    const start = { x: 0.5, y: 0.5 };
    const moved = focalAfterDrag(start, -0.2, 0.3, LAND, PORT);
    expect(axisOffset(moved.x, 2.25)).toBeCloseTo(axisOffset(0.5, 2.25) - 0.2);
    expect(moved.y).toBe(0.5); // no overflow vertically
    const far = focalAfterDrag(start, 5, 0, LAND, PORT);
    expect(axisOffset(far.x, 2.25)).toBe(0);
  });

  it("an image that fits its cell keeps the centre", () => {
    expect(coverObjectPosition({ x: 0.1, y: 0.9 }, PORT, PORT)).toBe("50% 50%");
    expect(focalAfterDrag({ x: 0.1, y: 0.9 }, 0.3, 0.3, PORT, PORT)).toEqual({ x: 0.1, y: 0.9 });
  });
});
