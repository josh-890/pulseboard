import {
  formatIntensity,
  INTENSITY_MAX_RANGE,
  intensityCap,
  isIntensityStep,
  isPointsStep,
} from "@/lib/intensity";

// The intensity catalog as a file to work on offline (2026-10-26): exported as
// an Excel workbook, edited, imported back. Pure: the import is planned here —
// checked against the catalog as it is and described as additions, changes and
// removals — and only applied (intensity-catalog-transfer-service) once the
// preview has been seen. The file is the catalog: what it leaves out goes,
// unless sessions use it; then it stays and the preview says so.
//
// Rows are matched by their id column; a row without one is new. References
// between sheets go by name (an act's scenario, an extra's group, a preset's
// acts), so a rename in the file is followed everywhere in the same file.

/** Several names in one cell, e.g. a preset's acts */
export const LIST_SEPARATOR = ";";

export const SHEETS = {
  readme: "Read me",
  settings: "Settings",
  scale: "Scale",
  boundaries: "Boundaries",
  scenarios: "Scenarios",
  acts: "Acts",
  groups: "Extra groups",
  extras: "Extras",
  presets: "Presets",
} as const;

export type SheetName = (typeof SHEETS)[keyof typeof SHEETS];

// ─── The catalog as it is ────────────────────────────────────────────────────

export type CatalogSnapshot = {
  max: number;
  scale: { value: number; title: string | null; description: string | null }[];
  boundaries: {
    id: string;
    value: number;
    title: string;
    description: string | null;
  }[];
  scenarios: { id: string; name: string; sortOrder: number; ticked: number }[];
  acts: {
    id: string;
    scenarioId: string;
    name: string;
    level: number;
    description: string | null;
    sortOrder: number;
    ticked: number;
  }[];
  groups: { id: string; name: string; sortOrder: number; offIn: string[] }[];
  /** offIn: the extra's own scope (only meaningful without a group) */
  extras: {
    id: string;
    name: string;
    points: number;
    groupId: string | null;
    isMax: boolean;
    sortOrder: number;
    offIn: string[];
    used: number;
  }[];
  presets: {
    id: string;
    scenarioId: string;
    name: string;
    description: string | null;
    sortOrder: number;
    actIds: string[];
    extraIds: string[];
  }[];
};

// ─── The catalog as the file says ────────────────────────────────────────────

type Row = { row: number };
export type CatalogFile = {
  max: number | null;
  scale: (Row & {
    value: number | null;
    title: string | null;
    description: string | null;
  })[];
  boundaries: (Row & {
    id: string | null;
    value: number | null;
    title: string | null;
    description: string | null;
  })[];
  scenarios: (Row & {
    id: string | null;
    name: string | null;
    order: number | null;
  })[];
  acts: (Row & {
    id: string | null;
    scenario: string | null;
    name: string | null;
    level: number | null;
    description: string | null;
    order: number | null;
  })[];
  groups: (Row & {
    id: string | null;
    name: string | null;
    order: number | null;
    notIn: string[];
  })[];
  extras: (Row & {
    id: string | null;
    name: string | null;
    points: number | null;
    group: string | null;
    notIn: string[];
    isMax: boolean;
    order: number | null;
  })[];
  presets: (Row & {
    id: string | null;
    scenario: string | null;
    name: string | null;
    description: string | null;
    order: number | null;
    acts: string[];
    extras: string[];
  })[];
};

export type ImportProblem = { sheet: SheetName; row?: number; message: string };
export type ImportChange = {
  sheet: SheetName;
  kind: "add" | "change" | "remove";
  label: string;
  details: string[];
};
export type ImportKept = { sheet: SheetName; label: string; reason: string };

/** A row as it will be written; `id` null = new, `key` names it within the plan */
type Target<T> = T & { id: string | null; key: string; sortOrder: number };

export type ImportPlan = {
  problems: ImportProblem[];
  changes: ImportChange[];
  kept: ImportKept[];
  max: number;
  scale: { value: number; title: string | null; description: string | null }[];
  boundaries: Target<{
    value: number;
    title: string;
    description: string | null;
  }>[];
  scenarios: Target<{ name: string }>[];
  acts: Target<{
    scenarioKey: string;
    name: string;
    level: number;
    description: string | null;
  }>[];
  groups: Target<{ name: string; offIn: string[] /* scenario keys */ }>[];
  extras: Target<{
    name: string;
    points: number;
    groupKey: string | null;
    offIn: string[];
    isMax: boolean;
  }>[];
  presets: Target<{
    scenarioKey: string;
    name: string;
    description: string | null;
    actKeys: string[];
    extraKeys: string[];
  }>[];
  /** Existing rows the file leaves out and nothing uses */
  remove: {
    boundaries: string[];
    scenarios: string[];
    acts: string[];
    groups: string[];
    extras: string[];
    presets: string[];
  };
  /** Every existing extra that ends up in a group, by group — the service checks no session holds two of one group */
  groupMembers: { extraId: string; groupKey: string }[];
  /** For saved filters and Smart Collections; `id` keeps a swap of two names apart */
  renames: {
    scenarios: { id: string; from: string; to: string }[];
    acts: { id: string; scenario: string; from: string; to: string }[];
  };
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "") === (b ?? "");
const byOrder = <T extends Row & { order: number | null }>(rows: T[]) =>
  [...rows].sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.row - b.row,
  );

/**
 * Plans the import of `file` over `current`. Everything wrong is collected —
 * with sheet and row — rather than stopping at the first; a plan with problems
 * is shown but cannot be applied.
 */
export function planCatalogImport(
  current: CatalogSnapshot,
  file: CatalogFile,
): ImportPlan {
  const problems: ImportProblem[] = [];
  const changes: ImportChange[] = [];
  const kept: ImportKept[] = [];
  const problem = (
    sheet: SheetName,
    row: number | undefined,
    message: string,
  ) => problems.push({ sheet, row, message });
  const change = (
    sheet: SheetName,
    kind: ImportChange["kind"],
    label: string,
    details: string[] = [],
  ) => changes.push({ sheet, kind, label, details });

  /** Matches each row to an existing one by id; unknown and repeated ids are problems */
  function match<
    T extends Row & { id: string | null },
    C extends { id: string },
  >(sheet: SheetName, rows: T[], existing: C[]) {
    const byId = new Map(existing.map((e) => [e.id, e]));
    const seen = new Set<string>();
    return rows.map((r) => {
      if (!r.id) return { r, before: null as C | null };
      if (seen.has(r.id)) {
        problem(
          sheet,
          r.row,
          `The id ${r.id} is used twice — each row stands for one entry; clear the id on a copy to add it as new.`,
        );
        return { r, before: null };
      }
      seen.add(r.id);
      const before = byId.get(r.id) ?? null;
      if (!before)
        problem(
          sheet,
          r.row,
          `Unknown id ${r.id} — it belongs to no entry here; clear it to add the row as new.`,
        );
      return { r, before };
    });
  }

  function requireName(
    sheet: SheetName,
    r: Row & { name: string | null },
  ): string | null {
    const name = r.name?.trim();
    if (!name) {
      problem(sheet, r.row, "The name is empty.");
      return null;
    }
    return name;
  }

  // ── Max ──
  let max = current.max;
  if (file.max === null) problem(SHEETS.settings, undefined, "Max is missing.");
  else if (
    !Number.isInteger(file.max) ||
    file.max < INTENSITY_MAX_RANGE.min ||
    file.max > INTENSITY_MAX_RANGE.max
  ) {
    problem(
      SHEETS.settings,
      undefined,
      `Max is a whole number from ${INTENSITY_MAX_RANGE.min} to ${INTENSITY_MAX_RANGE.max}.`,
    );
  } else {
    max = file.max;
    if (max !== current.max)
      change(SHEETS.settings, "change", "Max", [`${current.max} → ${max}`]);
  }
  const cap = intensityCap(max);

  // ── Scale ──
  const scale: ImportPlan["scale"] = [];
  const scaleValues = new Set<number>();
  for (const r of file.scale) {
    const title = r.title?.trim() || null;
    const description = r.description?.trim() || null;
    if (!title && !description) continue;
    if (r.value === null || !isIntensityStep(r.value) || r.value > max) {
      problem(
        SHEETS.scale,
        r.row,
        `A value on the scale is 0 to ${max} in steps of 0.5.`,
      );
      continue;
    }
    if (scaleValues.has(r.value)) {
      problem(
        SHEETS.scale,
        r.row,
        `${formatIntensity(r.value)} is described twice.`,
      );
      continue;
    }
    scaleValues.add(r.value);
    scale.push({ value: r.value, title, description });
  }
  {
    const before = new Map(current.scale.map((s) => [s.value, s]));
    const after = new Map(scale.map((s) => [s.value, s]));
    for (const s of scale) {
      const b = before.get(s.value);
      if (!b)
        change(SHEETS.scale, "add", formatIntensity(s.value), [
          s.title ?? s.description ?? "",
        ]);
      else if (!same(b.title, s.title) || !same(b.description, s.description)) {
        change(
          SHEETS.scale,
          "change",
          formatIntensity(s.value),
          describe([
            ["title", b.title, s.title],
            ["description", b.description, s.description],
          ]),
        );
      }
    }
    for (const b of current.scale)
      if (!after.has(b.value))
        change(SHEETS.scale, "remove", formatIntensity(b.value), [
          b.title ?? b.description ?? "",
        ]);
  }

  // ── Boundaries ──
  const boundaries: ImportPlan["boundaries"] = [];
  const boundaryValues = new Set<number>();
  for (const { r, before } of match(
    SHEETS.boundaries,
    file.boundaries,
    current.boundaries,
  )) {
    const title = r.title?.trim();
    if (!title) {
      problem(SHEETS.boundaries, r.row, "The title is empty.");
      continue;
    }
    if (
      r.value === null ||
      !isIntensityStep(r.value) ||
      r.value <= 0 ||
      r.value > max
    ) {
      problem(
        SHEETS.boundaries,
        r.row,
        `A boundary lies on a seam from 0.5 up to ${max}, in half steps.`,
      );
      continue;
    }
    if (boundaryValues.has(r.value)) {
      problem(
        SHEETS.boundaries,
        r.row,
        `There is a boundary at ${formatIntensity(r.value)} already.`,
      );
      continue;
    }
    boundaryValues.add(r.value);
    const description = r.description?.trim() || null;
    boundaries.push({
      id: before?.id ?? null,
      key: `b${r.row}`,
      sortOrder: 0,
      value: r.value,
      title,
      description,
    });
    if (!before)
      change(
        SHEETS.boundaries,
        "add",
        `${title} (${formatIntensity(r.value)})`,
      );
    else {
      const d = describe([
        ["title", before.title, title],
        ["at", formatIntensity(before.value), formatIntensity(r.value)],
        ["description", before.description, description],
      ]);
      if (d.length) change(SHEETS.boundaries, "change", before.title, d);
    }
  }
  const boundaryIds = new Set(boundaries.map((b) => b.id));
  const removeBoundaries = current.boundaries.filter(
    (b) => !boundaryIds.has(b.id),
  );
  for (const b of removeBoundaries)
    change(
      SHEETS.boundaries,
      "remove",
      `${b.title} (${formatIntensity(b.value)})`,
    );

  // ── Scenarios ──
  const scenarios: ImportPlan["scenarios"] = [];
  const scenarioByName = new Map<string, string>(); // name → key
  const scenarioName = new Map<string, string>(); // key → name
  const renames: ImportPlan["renames"] = { scenarios: [], acts: [] };
  for (const { r, before } of match(
    SHEETS.scenarios,
    byOrder(file.scenarios),
    current.scenarios,
  )) {
    const name = requireName(SHEETS.scenarios, r);
    if (!name) continue;
    if (scenarioByName.has(name)) {
      problem(SHEETS.scenarios, r.row, `Two scenarios are called “${name}”.`);
      continue;
    }
    const key = before?.id ?? `s${r.row}`;
    scenarioByName.set(name, key);
    scenarioName.set(key, name);
    scenarios.push({
      id: before?.id ?? null,
      key,
      sortOrder: scenarios.length,
      name,
    });
    if (!before) change(SHEETS.scenarios, "add", name);
    else if (before.name !== name) {
      change(SHEETS.scenarios, "change", before.name, [`renamed to ${name}`]);
      renames.scenarios.push({ id: before.id, from: before.name, to: name });
    }
  }
  // Left out: removed, or kept while its acts are ticked
  const fileScenarioIds = new Set(scenarios.map((s) => s.id));
  const removeScenarios: string[] = [];
  for (const s of current.scenarios.filter((s) => !fileScenarioIds.has(s.id))) {
    if (s.ticked > 0) {
      kept.push({
        sheet: SHEETS.scenarios,
        label: s.name,
        reason: `its acts are ticked in ${plural(s.ticked, "session")}`,
      });
      if (scenarioByName.has(s.name))
        problem(
          SHEETS.scenarios,
          undefined,
          `“${s.name}” stays (in use) — a new scenario cannot take its name.`,
        );
      scenarioByName.set(s.name, s.id);
      scenarioName.set(s.id, s.name);
      scenarios.push({
        id: s.id,
        key: s.id,
        sortOrder: scenarios.length,
        name: s.name,
      });
    } else {
      removeScenarios.push(s.id);
      change(SHEETS.scenarios, "remove", s.name);
    }
  }
  const scenarioKeyOf = (
    sheet: SheetName,
    row: number,
    name: string | null,
  ): string | null => {
    const key = name ? scenarioByName.get(name.trim()) : undefined;
    if (!key)
      problem(
        sheet,
        row,
        name ? `No scenario is called “${name}”.` : "The scenario is empty.",
      );
    return key ?? null;
  };

  // ── Acts ──
  const acts: ImportPlan["acts"] = [];
  const actByName = new Map<string, string>(); // `${scenarioKey}\u0000${name}` → key
  const actScenario = new Map<string, string>(); // act key → scenario key
  const actLabel = (scenarioKey: string, name: string) =>
    `${name} (${scenarioName.get(scenarioKey) ?? "?"})`;
  const currentScenarioName = new Map(
    current.scenarios.map((s) => [s.id, s.name]),
  );
  const cellOrder = new Map<string, number>();
  for (const { r, before } of match(
    SHEETS.acts,
    byOrder(file.acts),
    current.acts,
  )) {
    const name = requireName(SHEETS.acts, r);
    const scenarioKey = scenarioKeyOf(SHEETS.acts, r.row, r.scenario);
    if (!name || !scenarioKey) continue;
    if (r.level === null || !isIntensityStep(r.level)) {
      problem(
        SHEETS.acts,
        r.row,
        "The level must be 0 or more, in steps of 0.5.",
      );
      continue;
    }
    if (r.level > cap) {
      problem(
        SHEETS.acts,
        r.row,
        `The level goes up to ${formatIntensity(cap)} — only Max reaches ${max}.`,
      );
      continue;
    }
    const k = `${scenarioKey}\u0000${name}`;
    if (actByName.has(k)) {
      problem(
        SHEETS.acts,
        r.row,
        `Two acts called “${name}” in ${scenarioName.get(scenarioKey)}.`,
      );
      continue;
    }
    const key = before?.id ?? `a${r.row}`;
    actByName.set(k, key);
    actScenario.set(key, scenarioKey);
    const cell = `${scenarioKey}\u0000${r.level}`;
    const sortOrder = cellOrder.get(cell) ?? 0;
    cellOrder.set(cell, sortOrder + 1);
    const description = r.description?.trim() || null;
    acts.push({
      id: before?.id ?? null,
      key,
      sortOrder,
      scenarioKey,
      name,
      level: r.level,
      description,
    });
    if (!before)
      change(SHEETS.acts, "add", actLabel(scenarioKey, name), [
        `level ${formatIntensity(r.level)}`,
      ]);
    else {
      const d = describe([
        ["name", before.name, name],
        // The same scenario under a new name is no move
        [
          "scenario",
          currentScenarioName.get(before.scenarioId) ?? null,
          before.scenarioId === scenarioKey
            ? (currentScenarioName.get(before.scenarioId) ?? null)
            : (scenarioName.get(scenarioKey) ?? null),
        ],
        ["level", formatIntensity(before.level), formatIntensity(r.level)],
        ["description", before.description, description],
      ]);
      if (d.length)
        change(
          SHEETS.acts,
          "change",
          `${before.name} (${currentScenarioName.get(before.scenarioId) ?? "?"})`,
          d,
        );
      if (before.name !== name) {
        renames.acts.push({
          id: before.id,
          scenario: currentScenarioName.get(before.scenarioId) ?? "",
          from: before.name,
          to: name,
        });
      }
    }
  }
  const fileActIds = new Set(acts.map((a) => a.id));
  const removeActs: string[] = [];
  for (const a of current.acts.filter((a) => !fileActIds.has(a.id))) {
    const label = `${a.name} (${currentScenarioName.get(a.scenarioId) ?? "?"})`;
    // An act in a removed scenario goes with it — unless ticked, which keeps the scenario too
    if (a.ticked > 0) {
      kept.push({
        sheet: SHEETS.acts,
        label,
        reason: `ticked in ${plural(a.ticked, "session")}`,
      });
      if (a.level > cap)
        problem(
          SHEETS.acts,
          undefined,
          `${label} stays (in use) at ${formatIntensity(a.level)}, above ${formatIntensity(cap)} — Max cannot become ${max}.`,
        );
      const k = `${a.scenarioId}\u0000${a.name}`;
      if (actByName.has(k))
        problem(
          SHEETS.acts,
          undefined,
          `${label} stays (in use) — a new act there cannot take its name.`,
        );
      actByName.set(k, a.id);
      actScenario.set(a.id, a.scenarioId);
    } else {
      removeActs.push(a.id);
      change(SHEETS.acts, "remove", label);
    }
  }

  // ── Extra groups ──
  const groups: ImportPlan["groups"] = [];
  const groupByName = new Map<string, string>();
  const groupOffIn = new Map<string, string[]>();
  const scopeKeys = (sheet: SheetName, row: number, names: string[]) =>
    names.flatMap((n) => {
      const key = scenarioByName.get(n);
      if (!key) {
        problem(sheet, row, `No scenario is called “${n}”.`);
        return [];
      }
      return [key];
    });
  const scopeLabel = (keys: string[]) =>
    keys.length
      ? `not in ${keys.map((k) => scenarioName.get(k)).join(", ")}`
      : "every scenario";
  for (const { r, before } of match(
    SHEETS.groups,
    byOrder(file.groups),
    current.groups,
  )) {
    const name = requireName(SHEETS.groups, r);
    if (!name) continue;
    if (groupByName.has(name)) {
      problem(SHEETS.groups, r.row, `Two groups are called “${name}”.`);
      continue;
    }
    const key = before?.id ?? `g${r.row}`;
    const offIn = scopeKeys(SHEETS.groups, r.row, r.notIn);
    groupByName.set(name, key);
    groupOffIn.set(key, offIn);
    groups.push({
      id: before?.id ?? null,
      key,
      sortOrder: groups.length,
      name,
      offIn,
    });
    if (!before) change(SHEETS.groups, "add", name, [scopeLabel(offIn)]);
    else {
      const d = describe([
        ["name", before.name, name],
        ["counts", scopeLabel(before.offIn), scopeLabel(offIn)],
      ]);
      if (d.length) change(SHEETS.groups, "change", before.name, d);
    }
  }
  const fileGroupIds = new Set(groups.map((g) => g.id));
  const removeGroups = current.groups.filter((g) => !fileGroupIds.has(g.id));
  for (const g of removeGroups)
    change(SHEETS.groups, "remove", g.name, [
      "its extras stay, without a group",
    ]);
  const currentGroupName = new Map(current.groups.map((g) => [g.id, g.name]));

  // ── Extras ──
  const extras: ImportPlan["extras"] = [];
  const extraByName = new Map<string, string>();
  const extraGroup = new Map<string, string | null>();
  const extraOffIn = new Map<string, string[]>();
  const maxExtra = current.extras.find((e) => e.isMax) ?? null;
  for (const { r, before } of match(
    SHEETS.extras,
    byOrder(file.extras),
    current.extras,
  )) {
    const name = requireName(SHEETS.extras, r);
    if (!name) continue;
    if (extraByName.has(name)) {
      problem(SHEETS.extras, r.row, `Two extras are called “${name}”.`);
      continue;
    }
    const isMax = !!before?.isMax;
    if (r.isMax !== isMax) {
      problem(
        SHEETS.extras,
        r.row,
        isMax
          ? "This is the Max extra — keep “yes” in the Max column."
          : "Only the exported Max row can be Max.",
      );
      continue;
    }
    let groupKey: string | null = null;
    if (r.group?.trim()) {
      groupKey = groupByName.get(r.group.trim()) ?? null;
      if (!groupKey) {
        problem(
          SHEETS.extras,
          r.row,
          `No group is called “${r.group.trim()}”.`,
        );
        continue;
      }
    }
    if (r.points === null || !isPointsStep(r.points)) {
      problem(
        SHEETS.extras,
        r.row,
        "Points go in steps of 0.5, from −20 to +20.",
      );
      continue;
    }
    // Max carries no points in the file — it always sets the top
    if (isMax && (groupKey !== null || r.notIn.length)) {
      problem(
        SHEETS.extras,
        r.row,
        "Max always sets the top and counts everywhere — only its name can change.",
      );
      continue;
    }
    if (groupKey && r.notIn.length) {
      problem(
        SHEETS.extras,
        r.row,
        "An extra in a group counts where its group does — leave “Not counted in” empty and set it on the group.",
      );
      continue;
    }
    const key = before?.id ?? `e${r.row}`;
    const offIn = groupKey ? [] : scopeKeys(SHEETS.extras, r.row, r.notIn);
    extraByName.set(name, key);
    extraGroup.set(key, groupKey);
    extraOffIn.set(key, groupKey ? (groupOffIn.get(groupKey) ?? []) : offIn);
    extras.push({
      id: before?.id ?? null,
      key,
      sortOrder: extras.length,
      name,
      points: isMax ? before!.points : r.points,
      groupKey,
      offIn,
      isMax,
    });
    const groupLabel = (g: string | null, names: Map<string, string>) =>
      g ? (names.get(g) ?? "?") : "no group";
    const newGroupNames = new Map(groups.map((g) => [g.key, g.name]));
    if (!before)
      change(SHEETS.extras, "add", name, [
        `${r.points} points`,
        groupLabel(groupKey, newGroupNames),
      ]);
    else {
      const d = describe([
        ["name", before.name, name],
        [
          "points",
          String(before.points),
          String(isMax ? before.points : r.points),
        ],
        [
          "group",
          groupLabel(before.groupId, currentGroupName),
          groupLabel(groupKey, newGroupNames),
        ],
        ...(groupKey || before.groupId
          ? []
          : ([["counts", scopeLabel(before.offIn), scopeLabel(offIn)]] as [
              string,
              string,
              string,
            ][])),
      ]);
      if (d.length) change(SHEETS.extras, "change", before.name, d);
    }
  }
  const fileExtraIds = new Set(extras.map((e) => e.id));
  const removeExtras: string[] = [];
  for (const e of current.extras.filter((e) => !fileExtraIds.has(e.id))) {
    if (e.isMax || e.used > 0) {
      kept.push({
        sheet: SHEETS.extras,
        label: e.name,
        reason: e.isMax
          ? "Max cannot be removed"
          : `used ${plural(e.used, "time")} in sessions`,
      });
      if (extraByName.has(e.name))
        problem(
          SHEETS.extras,
          undefined,
          `“${e.name}” stays — a new extra cannot take its name.`,
        );
      // A kept extra whose group goes loses it, as in the app
      const groupKey =
        e.groupId && fileGroupIds.has(e.groupId) ? e.groupId : null;
      extraByName.set(e.name, e.id);
      extraGroup.set(e.id, groupKey);
      extraOffIn.set(
        e.id,
        e.isMax ? [] : groupKey ? (groupOffIn.get(groupKey) ?? []) : e.offIn,
      );
    } else {
      removeExtras.push(e.id);
      change(SHEETS.extras, "remove", e.name);
    }
  }
  if (!maxExtra)
    problem(
      SHEETS.extras,
      undefined,
      "The catalog has no Max extra — reload the page.",
    );

  // ── Presets ──
  const presets: ImportPlan["presets"] = [];
  const presetNames = new Set<string>();
  const presetOrder = new Map<string, number>();
  const currentActName = new Map(current.acts.map((a) => [a.id, a.name]));
  const currentExtraName = new Map(current.extras.map((e) => [e.id, e.name]));
  for (const { r, before } of match(
    SHEETS.presets,
    byOrder(file.presets),
    current.presets,
  )) {
    const name = requireName(SHEETS.presets, r);
    const scenarioKey = scenarioKeyOf(SHEETS.presets, r.row, r.scenario);
    if (!name || !scenarioKey) continue;
    if (presetNames.has(`${scenarioKey}\u0000${name}`)) {
      problem(
        SHEETS.presets,
        r.row,
        `Two presets called “${name}” in ${scenarioName.get(scenarioKey)}.`,
      );
      continue;
    }
    presetNames.add(`${scenarioKey}\u0000${name}`);
    let ok = true;
    const actKeys = [...new Set(r.acts)].flatMap((n) => {
      const key = actByName.get(`${scenarioKey}\u0000${n}`);
      if (!key) {
        problem(
          SHEETS.presets,
          r.row,
          `${scenarioName.get(scenarioKey)} has no act “${n}”.`,
        );
        ok = false;
        return [];
      }
      return [key];
    });
    const extraKeys = [...new Set(r.extras)].flatMap((n) => {
      const key = extraByName.get(n);
      if (!key) {
        problem(SHEETS.presets, r.row, `No extra is called “${n}”.`);
        ok = false;
        return [];
      }
      return [key];
    });
    const groupsUsed = extraKeys
      .map((k) => extraGroup.get(k))
      .filter((g): g is string => !!g);
    if (new Set(groupsUsed).size !== groupsUsed.length) {
      problem(SHEETS.presets, r.row, "Only one extra per group.");
      ok = false;
    }
    const off = extraKeys.find((k) =>
      (extraOffIn.get(k) ?? []).includes(scenarioKey),
    );
    if (off) {
      problem(
        SHEETS.presets,
        r.row,
        `${[...extraByName].find(([, k]) => k === off)?.[0]} does not count in ${scenarioName.get(scenarioKey)}.`,
      );
      ok = false;
    }
    if (!ok) continue;
    const sortOrder = presetOrder.get(scenarioKey) ?? 0;
    presetOrder.set(scenarioKey, sortOrder + 1);
    const description = r.description?.trim() || null;
    presets.push({
      id: before?.id ?? null,
      key: before?.id ?? `p${r.row}`,
      sortOrder,
      scenarioKey,
      name,
      description,
      actKeys,
      extraKeys,
    });
    const label = `${name} (${scenarioName.get(scenarioKey)})`;
    if (!before)
      change(SHEETS.presets, "add", label, [
        plural(actKeys.length, "act"),
        plural(extraKeys.length, "extra"),
      ]);
    else {
      const names = (ids: string[], m: Map<string, string>) =>
        ids
          .map((i) => m.get(i) ?? "?")
          .sort()
          .join(", ") || "none";
      const fileActNames = new Map(acts.map((a) => [a.key, a.name]));
      for (const [id, n] of currentActName)
        if (!fileActNames.has(id)) fileActNames.set(id, n);
      const fileExtraNames = new Map(extras.map((e) => [e.key, e.name]));
      for (const [id, n] of currentExtraName)
        if (!fileExtraNames.has(id)) fileExtraNames.set(id, n);
      const d = describe([
        ["name", before.name, name],
        [
          "scenario",
          currentScenarioName.get(before.scenarioId) ?? null,
          before.scenarioId === scenarioKey
            ? (currentScenarioName.get(before.scenarioId) ?? null)
            : (scenarioName.get(scenarioKey) ?? null),
        ],
        ["description", before.description, description],
        // The same acts and extras under new names are no change
        ...(sameSet(before.actIds, actKeys)
          ? []
          : ([
              [
                "acts",
                names(before.actIds, currentActName),
                names(actKeys, fileActNames),
              ],
            ] as Field[])),
        ...(sameSet(before.extraIds, extraKeys)
          ? []
          : ([
              [
                "extras",
                names(before.extraIds, currentExtraName),
                names(extraKeys, fileExtraNames),
              ],
            ] as Field[])),
      ]);
      if (d.length)
        change(
          SHEETS.presets,
          "change",
          `${before.name} (${currentScenarioName.get(before.scenarioId) ?? "?"})`,
          d,
        );
    }
  }
  const filePresetIds = new Set(presets.map((p) => p.id));
  const removePresets = current.presets.filter((p) => !filePresetIds.has(p.id));
  for (const p of removePresets)
    change(
      SHEETS.presets,
      "remove",
      `${p.name} (${currentScenarioName.get(p.scenarioId) ?? "?"})`,
      ["the ticks it made stay"],
    );

  // Order: a reorder alone is not worth a line per row — one per sheet
  const reordered = (
    sheet: SheetName,
    before: { id: string; sortOrder: number }[],
    after: { id: string | null }[],
  ) => {
    const was = [...before]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((x) => x.id)
      .filter((id) => after.some((a) => a.id === id));
    const now = after
      .map((a) => a.id)
      .filter((id): id is string => !!id && was.includes(id));
    if (was.join() !== now.join())
      change(sheet, "change", "Order", ["the rows' order changes"]);
  };
  reordered(SHEETS.scenarios, current.scenarios, scenarios);
  reordered(SHEETS.groups, current.groups, groups);

  return {
    problems,
    changes,
    kept,
    max,
    scale,
    boundaries,
    scenarios,
    acts,
    groups,
    extras,
    presets,
    remove: {
      boundaries: removeBoundaries.map((b) => b.id),
      scenarios: removeScenarios,
      acts: removeActs,
      groups: removeGroups.map((g) => g.id),
      extras: removeExtras,
      presets: removePresets.map((p) => p.id),
    },
    groupMembers: [...extraGroup].flatMap(([key, groupKey]) =>
      groupKey && current.extras.some((e) => e.id === key)
        ? [{ extraId: key, groupKey }]
        : [],
    ),
    renames,
  };
}

type Field = [string, string | null, string | null];

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** "level 2 → 3" for each field that differs */
function describe(fields: [string, string | null, string | null][]): string[] {
  return fields.flatMap(([what, from, to]) =>
    same(from, to) ? [] : [`${what}: ${from || "—"} → ${to || "—"}`],
  );
}

/** Splits a cell of several names: "Topless; Full nude" */
export function splitList(text: string | null): string[] {
  return (text ?? "")
    .split(LIST_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}
