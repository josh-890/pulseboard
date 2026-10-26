import { describe, expect, it } from "vitest";
import {
  planCatalogImport,
  splitList,
  SHEETS,
  type CatalogFile,
  type CatalogSnapshot,
} from "@/lib/intensity-catalog-transfer";

// The catalog import, planned (2026-10-26): what a file adds, changes and
// removes; what stays because sessions use it; and what is wrong with it.

const current: CatalogSnapshot = {
  max: 10,
  scale: [{ value: 3, title: "Bold", description: null }],
  boundaries: [{ id: "b1", value: 4.5, title: "Nude", description: null }],
  scenarios: [
    { id: "solo", name: "Solo", sortOrder: 0, ticked: 3 },
    { id: "duo", name: "Duo", sortOrder: 1, ticked: 0 },
  ],
  acts: [
    {
      id: "topless",
      scenarioId: "solo",
      name: "Topless",
      level: 2,
      description: null,
      sortOrder: 0,
      ticked: 3,
    },
    {
      id: "nude",
      scenarioId: "solo",
      name: "Full nude",
      level: 3,
      description: null,
      sortOrder: 0,
      ticked: 0,
    },
    {
      id: "kiss",
      scenarioId: "duo",
      name: "Kiss",
      level: 1,
      description: null,
      sortOrder: 0,
      ticked: 0,
    },
  ],
  groups: [{ id: "place", name: "Place", sortOrder: 0, offIn: [] }],
  extras: [
    {
      id: "max",
      name: "Max",
      points: 0,
      groupId: null,
      isMax: true,
      sortOrder: 0,
      offIn: [],
      used: 0,
    },
    {
      id: "outdoor",
      name: "Outdoor",
      points: 1,
      groupId: "place",
      isMax: false,
      sortOrder: 1,
      offIn: [],
      used: 2,
    },
    {
      id: "beach",
      name: "Beach",
      points: 1.5,
      groupId: "place",
      isMax: false,
      sortOrder: 2,
      offIn: [],
      used: 0,
    },
  ],
  presets: [
    {
      id: "p1",
      scenarioId: "solo",
      name: "Art",
      description: null,
      sortOrder: 0,
      actIds: ["topless"],
      extraIds: ["outdoor"],
    },
  ],
};

/** The current catalog, as an untouched export reads */
function fileOf(c: CatalogSnapshot): CatalogFile {
  const name = new Map(
    [...c.scenarios, ...c.groups, ...c.acts, ...c.extras].map((x) => [
      x.id,
      x.name,
    ]),
  );
  let row = 1;
  const r = () => ++row;
  return {
    max: c.max,
    scale: c.scale.map((s) => ({ row: r(), ...s })),
    boundaries: c.boundaries.map((b) => ({ row: r(), ...b })),
    scenarios: c.scenarios.map((s, i) => ({
      row: r(),
      id: s.id,
      name: s.name,
      order: i + 1,
    })),
    acts: c.acts.map((a, i) => ({
      row: r(),
      id: a.id,
      scenario: name.get(a.scenarioId)!,
      name: a.name,
      level: a.level,
      description: a.description,
      order: i + 1,
    })),
    groups: c.groups.map((g, i) => ({
      row: r(),
      id: g.id,
      name: g.name,
      order: i + 1,
      notIn: g.offIn.map((s) => name.get(s)!),
    })),
    extras: c.extras.map((e, i) => ({
      row: r(),
      id: e.id,
      name: e.name,
      points: e.isMax ? 0 : e.points,
      group: e.groupId ? name.get(e.groupId)! : null,
      notIn: e.offIn.map((s) => name.get(s)!),
      isMax: e.isMax,
      order: i + 1,
    })),
    presets: c.presets.map((p, i) => ({
      row: r(),
      id: p.id,
      scenario: name.get(p.scenarioId)!,
      name: p.name,
      description: p.description,
      order: i + 1,
      acts: p.actIds.map((a) => name.get(a)!),
      extras: p.extraIds.map((e) => name.get(e)!),
    })),
  };
}

const labels = (
  plan: ReturnType<typeof planCatalogImport>,
  kind: "add" | "change" | "remove",
) =>
  plan.changes
    .filter((c) => c.kind === kind)
    .map((c) => `${c.sheet}: ${c.label}`);

describe("planCatalogImport", () => {
  it("finds nothing to do in an untouched export", () => {
    const plan = planCatalogImport(current, fileOf(current));
    expect(plan.problems).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.kept).toEqual([]);
  });

  it("follows a rename by id, in the referencing sheets too", () => {
    const f = fileOf(current);
    f.scenarios[0]!.name = "Alone";
    f.acts
      .filter((a) => a.scenario === "Solo")
      .forEach((a) => (a.scenario = "Alone"));
    f.presets[0]!.scenario = "Alone";
    f.acts[0]!.name = "Topless outdoors";
    f.presets[0]!.acts = ["Topless outdoors"];
    const plan = planCatalogImport(current, f);
    expect(plan.problems).toEqual([]);
    expect(labels(plan, "change")).toEqual([
      `${SHEETS.scenarios}: Solo`,
      `${SHEETS.acts}: Topless (Solo)`,
    ]);
    expect(plan.renames).toEqual({
      scenarios: [{ id: "solo", from: "Solo", to: "Alone" }],
      acts: [{ id: "topless", scenario: "Solo", from: "Topless", to: "Topless outdoors" }],
    });
    // The preset's acts are the same act under its new name: no change
    expect(plan.changes.some((c) => c.sheet === SHEETS.presets)).toBe(false);
  });

  it("adds rows without an id and names the changed fields", () => {
    const f = fileOf(current);
    f.acts.push({
      row: 50,
      id: null,
      scenario: "Duo",
      name: "Hug",
      level: 0.5,
      description: null,
      order: null,
    });
    f.acts[1]!.level = 3.5;
    f.max = 12;
    const plan = planCatalogImport(current, f);
    expect(plan.problems).toEqual([]);
    expect(labels(plan, "add")).toEqual([`${SHEETS.acts}: Hug (Duo)`]);
    expect(
      plan.changes.find((c) => c.label === "Full nude (Solo)")?.details,
    ).toEqual(["level: 3 → 3.5"]);
    expect(plan.changes.find((c) => c.label === "Max")?.details).toEqual([
      "10 → 12",
    ]);
    expect(plan.max).toBe(12);
  });

  it("removes what the file leaves out, unless sessions use it", () => {
    const f = fileOf(current);
    f.acts = f.acts.filter(
      (a) => a.name !== "Topless" && a.name !== "Full nude",
    );
    f.extras = f.extras.filter((e) => e.isMax);
    f.presets = [];
    f.scenarios = f.scenarios.filter((s) => s.name !== "Solo");
    const plan = planCatalogImport(current, f);
    expect(plan.problems).toEqual([]);
    expect(plan.remove).toMatchObject({
      acts: ["nude"],
      extras: ["beach"],
      presets: ["p1"],
      scenarios: [],
    });
    expect(
      plan.kept.map((k) => `${k.sheet}: ${k.label} — ${k.reason}`),
    ).toEqual([
      `${SHEETS.scenarios}: Solo — its acts are ticked in 3 sessions`,
      `${SHEETS.acts}: Topless (Solo) — ticked in 3 sessions`,
      `${SHEETS.extras}: Outdoor — used 2 times in sessions`,
    ]);
  });

  it("never removes Max, and lets only its name change", () => {
    const f = fileOf(current);
    f.extras = f.extras.filter((e) => !e.isMax);
    expect(planCatalogImport(current, f).kept).toContainEqual({
      sheet: SHEETS.extras,
      label: "Max",
      reason: "Max cannot be removed",
    });

    const g = fileOf(current);
    g.extras[0]!.group = "Place";
    expect(
      planCatalogImport(current, g).problems.map((p) => p.message),
    ).toContainEqual(
      "Max always sets the top and counts everywhere — only its name can change.",
    );
    const h = fileOf(current);
    h.extras[1]!.isMax = true;
    expect(
      planCatalogImport(current, h).problems.map((p) => p.message),
    ).toContainEqual("Only the exported Max row can be Max.");
  });

  it("collects every problem with its sheet and row", () => {
    const f = fileOf(current);
    f.acts[0]!.level = 9.75;
    f.acts[1]!.level = 10;
    f.acts.push({
      row: 60,
      id: "nope",
      scenario: "Duo",
      name: "Ghost",
      level: 1,
      description: null,
      order: null,
    });
    f.acts.push({
      row: 61,
      id: null,
      scenario: "Trio",
      name: "Odd",
      level: 1,
      description: null,
      order: null,
    });
    f.acts.push({
      row: 62,
      id: null,
      scenario: "Duo",
      name: "Kiss",
      level: 1,
      description: null,
      order: null,
    });
    f.extras[2]!.notIn = ["Duo"];
    f.presets[0]!.acts = ["Topless", "Kiss"];
    f.presets[0]!.extras = ["Outdoor", "Beach"];
    f.boundaries[0]!.value = 11;
    const problems = planCatalogImport(current, f).problems.map(
      (p) => `${p.sheet}${p.row ? `:${p.row}` : ""} ${p.message}`,
    );
    const row = (name: string) => f.acts.find((a) => a.name === name)!.row;
    expect(problems).toEqual(
      expect.arrayContaining([
        `${SHEETS.acts}:${row("Topless")} The level must be 0 or more, in steps of 0.5.`,
        `${SHEETS.acts}:${row("Full nude")} The level goes up to 9.5 — only Max reaches 10.`,
        `${SHEETS.acts}:60 Unknown id nope — it belongs to no entry here; clear it to add the row as new.`,
        `${SHEETS.acts}:61 No scenario is called “Trio”.`,
        `${SHEETS.acts}:62 Two acts called “Kiss” in Duo.`,
        expect.stringContaining(
          "An extra in a group counts where its group does",
        ),
        expect.stringContaining("Solo has no act “Kiss”."),
        `${SHEETS.boundaries}:${f.boundaries[0]!.row} A boundary lies on a seam from 0.5 up to 10, in half steps.`,
      ]),
    );
  });

  it("holds a preset to one extra per group and to extras that count in its scenario", () => {
    const f = fileOf(current);
    f.presets[0]!.extras = ["Outdoor", "Beach"];
    expect(
      planCatalogImport(current, f).problems.map((p) => p.message),
    ).toContain("Only one extra per group.");

    const g = fileOf(current);
    g.groups[0]!.notIn = ["Solo"];
    expect(
      planCatalogImport(current, g).problems.map((p) => p.message),
    ).toContain("Outdoor does not count in Solo.");
  });

  it("refuses a lower Max while a used act sits above it", () => {
    const busy = {
      ...current,
      acts: current.acts.map((a) =>
        a.id === "topless" ? { ...a, level: 6 } : a,
      ),
    };
    const f = fileOf(busy);
    f.acts = f.acts.filter((a) => a.name !== "Topless");
    f.max = 5;
    expect(
      planCatalogImport(busy, f).problems.map((p) => p.message),
    ).toContainEqual(
      "Topless (Solo) stays (in use) at 6, above 4.5 — Max cannot become 5.",
    );
  });

  it("orders by the Order column, then by row", () => {
    const f = fileOf(current);
    f.scenarios[0]!.order = 9;
    const plan = planCatalogImport(current, f);
    expect(plan.scenarios.map((s) => s.name)).toEqual(["Duo", "Solo"]);
    expect(labels(plan, "change")).toEqual([`${SHEETS.scenarios}: Order`]);
  });

  it("lists the final group of every existing extra for the session check", () => {
    const f = fileOf(current);
    f.extras.find((e) => e.name === "Beach")!.group = null;
    expect(planCatalogImport(current, f).groupMembers).toEqual([
      { extraId: "outdoor", groupKey: "place" },
    ]);
  });
});

describe("splitList", () => {
  it("splits on semicolons and drops the empty", () => {
    expect(splitList(" Topless;Full nude ; ")).toEqual([
      "Topless",
      "Full nude",
    ]);
    expect(splitList(null)).toEqual([]);
  });
});
