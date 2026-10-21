import { describe, expect, it } from "vitest";
import { summarizePersonIntensity, type PersonIntensityInput } from "@/lib/intensity-person";

// A person's intensity across sessions: peaks overall and per scenario, the
// mean, first times from dated sessions only, undated sessions last.
const catalog = {
  acts: new Map([
    ["swim", { level: 1.5, scenarioId: "glam" }],
    ["topless", { level: 5, scenarioId: "glam" }],
    ["spread", { level: 8, scenarioId: "solo" }],
  ]),
  extras: new Map([
    ["pub", { id: "pub", points: 2, groupId: "loc", isMax: false }],
    ["max", { id: "max", points: 0, groupId: null, isMax: true }],
  ]),
};
const d = (y: number) => new Date(Date.UTC(y, 0, 1));
const s = (id: string, date: Date | null, acts: string[], extraIds: string[] = [], precision = "DAY"): PersonIntensityInput => ({
  sessionId: id,
  sessionName: id,
  date,
  precision,
  extraIds,
  acts: acts.map((actId) => ({ actId, overrides: [] })),
});

describe("summarizePersonIntensity", () => {
  it("orders sessions by date, undated last; peak, per scenario, mean", () => {
    const r = summarizePersonIntensity(
      [s("b2021", d(2021), ["topless"], ["pub"]), s("undated", null, ["spread"]), s("a2019", d(2019), ["swim"])],
      catalog,
    );
    expect(r.sessions.map((x) => [x.sessionId, x.value])).toEqual([
      ["a2019", 1.5],
      ["b2021", 7],
      ["undated", 8],
    ]);
    expect(r.peak).toEqual({ value: 8, sessionId: "undated" });
    expect(r.scenarioPeaks).toEqual({ glam: { value: 7, sessionId: "b2021" }, solo: { value: 8, sessionId: "undated" } });
    expect(r.mean).toBeCloseTo((1.5 + 7 + 8) / 3);
  });

  it("first times come from dated sessions; an act only undated has no first", () => {
    const r = summarizePersonIntensity(
      [s("x", d(2020), ["swim"]), s("y", d(2022), ["swim", "topless"]), s("u", null, ["spread"]), s("v", d(2018), [], [], "UNKNOWN")],
      catalog,
    );
    expect(r.reached.swim).toMatchObject({ count: 2, first: { sessionId: "x" } });
    expect(r.reached.topless!.first!.sessionId).toBe("y");
    expect(r.reached.spread).toMatchObject({ count: 1, first: null });
    expect(r.sessions.find((x) => x.sessionId === "y")!.firsts).toEqual(["topless"]);
    // Precision UNKNOWN counts as undated
    expect(r.sessions.at(-1)!.dated).toBe(false);
  });

  it("Max in the session extras makes the session 10 but no scenario peak", () => {
    const r = summarizePersonIntensity([s("m", d(2020), [], ["max"])], catalog);
    expect(r.peak).toEqual({ value: 10, sessionId: "m" });
    expect(r.scenarioPeaks).toEqual({});
  });

  it("two on-camera roles in one session count once, at their best", () => {
    const r = summarizePersonIntensity([s("one", d(2020), ["swim"]), s("one", d(2020), ["topless"])], catalog);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0]!.value).toBe(5);
    expect(r.reached.swim!.count).toBe(1);
  });
});
