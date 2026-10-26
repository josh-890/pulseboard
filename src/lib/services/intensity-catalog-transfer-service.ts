import { createHash } from "crypto";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { INTENSITY_STEP } from "@/lib/intensity";
import {
  LIST_SEPARATOR,
  planCatalogImport,
  SHEETS,
  splitList,
  type CatalogFile,
  type CatalogSnapshot,
  type ImportPlan,
  type ImportProblem,
  type SheetName,
} from "@/lib/intensity-catalog-transfer";
import {
  getIntensityMax,
  INTENSITY_MAX_KEY,
  rewriteSavedQueries,
} from "@/lib/services/intensity-catalog-service";

// The intensity catalog as an Excel workbook (2026-10-26): export it, work on it
// offline, import it back. The import is previewed first (planCatalogImport) and
// applied in one transaction — only if the catalog has not changed since the
// preview (the fingerprint), so a preview never applies over someone's edit.

// ─── Snapshot ────────────────────────────────────────────────────────────────

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [max, scale, boundaries, scenarios, acts, groups, extras, presets] =
    await Promise.all([
      getIntensityMax(),
      prisma.intensityScaleStep.findMany({
        orderBy: { value: "asc" },
        select: { value: true, title: true, description: true },
      }),
      prisma.intensityBoundary.findMany({
        orderBy: { value: "asc" },
        select: { id: true, value: true, title: true, description: true },
      }),
      prisma.intensityScenario.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          acts: { select: { _count: { select: { contributions: true } } } },
        },
      }),
      prisma.intensityAct.findMany({
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          scenarioId: true,
          name: true,
          level: true,
          description: true,
          sortOrder: true,
          _count: { select: { contributions: true } },
        },
      }),
      prisma.intensityExtraGroup.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          scenariosOff: { select: { scenarioId: true } },
        },
      }),
      prisma.intensityExtra.findMany({
        orderBy: [{ points: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          points: true,
          groupId: true,
          isMax: true,
          sortOrder: true,
          scenariosOff: { select: { scenarioId: true } },
          _count: { select: { contributions: true, actOverrides: true } },
        },
      }),
      prisma.intensityPreset.findMany({
        orderBy: [
          { scenario: { sortOrder: "asc" } },
          { sortOrder: "asc" },
          { name: "asc" },
        ],
        select: {
          id: true,
          scenarioId: true,
          name: true,
          description: true,
          sortOrder: true,
          acts: { select: { actId: true }, orderBy: { actId: "asc" } },
          extras: { select: { extraId: true }, orderBy: { extraId: "asc" } },
        },
      }),
    ]);
  return {
    max,
    scale,
    boundaries,
    scenarios: scenarios.map(({ acts: a, ...s }) => ({
      ...s,
      ticked: a.reduce((n, x) => n + x._count.contributions, 0),
    })),
    acts: acts.map(({ _count, ...a }) => ({
      ...a,
      ticked: _count.contributions,
    })),
    groups: groups.map(({ scenariosOff, ...g }) => ({
      ...g,
      offIn: scenariosOff.map((o) => o.scenarioId).sort(),
    })),
    extras: extras.map(({ scenariosOff, _count, ...e }) => ({
      ...e,
      offIn: scenariosOff.map((o) => o.scenarioId).sort(),
      used: _count.contributions + _count.actOverrides,
    })),
    presets: presets.map(({ acts: a, extras: x, ...p }) => ({
      ...p,
      actIds: a.map((r) => r.actId),
      extraIds: x.map((r) => r.extraId),
    })),
  };
}

/** Changes whenever the catalog does — an import applies only over what was previewed */
export function catalogFingerprint(snapshot: CatalogSnapshot): string {
  return createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex")
    .slice(0, 16);
}

// ─── Export ──────────────────────────────────────────────────────────────────

type Column = { header: string; key: string; width: number };

const COLUMNS = {
  scale: [
    { header: "Value", key: "value", width: 8 },
    { header: "Title", key: "title", width: 28 },
    { header: "Description", key: "description", width: 70 },
  ],
  boundaries: [
    { header: "Id", key: "id", width: 12 },
    { header: "At", key: "value", width: 6 },
    { header: "Title", key: "title", width: 28 },
    { header: "Description", key: "description", width: 70 },
  ],
  scenarios: [
    { header: "Id", key: "id", width: 12 },
    { header: "Name", key: "name", width: 28 },
    { header: "Order", key: "order", width: 8 },
  ],
  acts: [
    { header: "Id", key: "id", width: 12 },
    { header: "Scenario", key: "scenario", width: 18 },
    { header: "Name", key: "name", width: 32 },
    { header: "Level", key: "level", width: 7 },
    { header: "Description", key: "description", width: 60 },
    { header: "Order", key: "order", width: 8 },
  ],
  groups: [
    { header: "Id", key: "id", width: 12 },
    { header: "Name", key: "name", width: 24 },
    { header: "Order", key: "order", width: 8 },
    { header: "Not counted in", key: "notIn", width: 36 },
  ],
  extras: [
    { header: "Id", key: "id", width: 12 },
    { header: "Name", key: "name", width: 28 },
    { header: "Points", key: "points", width: 8 },
    { header: "Group", key: "group", width: 20 },
    { header: "Not counted in", key: "notIn", width: 36 },
    { header: "Max", key: "isMax", width: 6 },
    { header: "Order", key: "order", width: 8 },
  ],
  presets: [
    { header: "Id", key: "id", width: 12 },
    { header: "Scenario", key: "scenario", width: 18 },
    { header: "Name", key: "name", width: 24 },
    { header: "Description", key: "description", width: 40 },
    { header: "Order", key: "order", width: 8 },
    { header: "Acts", key: "acts", width: 60 },
    { header: "Extras", key: "extras", width: 40 },
  ],
} satisfies Record<string, Column[]>;

const README = [
  "Intensity catalog — work on it here, then import it under Settings → Catalogs → Intensity.",
  "",
  "• Each sheet is one part of the catalog. Change cells, add rows, delete rows.",
  "• Id: leave it as it is — it ties a row to its entry, so a rename stays the same entry. A row without an id is new.",
  "• Names tie the sheets together: an act's Scenario, an extra's Group, a preset's Acts and Extras are names from the other sheets.",
  `• Several names in one cell are separated by “${LIST_SEPARATOR}”, e.g. “Topless${LIST_SEPARATOR} Full nude”.`,
  "• Order: smaller comes first; empty keeps the row's place in the sheet. Acts are ordered within their scenario and level.",
  "• Levels and points go in steps of 0.5. Levels reach half a step below Max; only the Max extra reaches Max.",
  "• Scale: a value without title and description is simply not described.",
  "• A row you delete is removed from the catalog — unless sessions use it (ticked acts, chosen extras); then it stays and the preview says so.",
  "• Nothing changes until you have seen the preview and pressed Apply.",
];

export async function exportCatalogWorkbook(): Promise<Buffer> {
  const snap = await getCatalogSnapshot();
  const scenarioName = new Map(snap.scenarios.map((s) => [s.id, s.name]));
  const groupName = new Map(snap.groups.map((g) => [g.id, g.name]));
  const actName = new Map(snap.acts.map((a) => [a.id, a.name]));
  const extraName = new Map(snap.extras.map((e) => [e.id, e.name]));
  const list = (ids: string[], names: Map<string, string>) =>
    ids
      .map((id) => names.get(id) ?? "")
      .filter(Boolean)
      .join(`${LIST_SEPARATOR} `);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulseboard";
  wb.created = new Date();

  const readme = wb.addWorksheet(SHEETS.readme);
  readme.getColumn(1).width = 120;
  README.forEach((line, i) => (readme.getCell(i + 1, 1).value = line));
  readme.getCell(1, 1).font = { bold: true, size: 13 };

  const settings = wb.addWorksheet(SHEETS.settings);
  settings.columns = [
    { header: "Setting", key: "setting", width: 14 },
    { header: "Value", key: "value", width: 10 },
    { header: "Note", key: "note", width: 70 },
  ];
  settings.addRow({
    setting: "Max",
    value: snap.max,
    note: "The top of the scale: a whole number from 3 to 20",
  });
  style(settings);

  const sheet = (
    name: SheetName,
    columns: Column[],
    rows: Record<string, unknown>[],
  ) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns;
    for (const r of rows) ws.addRow(r);
    style(ws);
    return ws;
  };

  const described = new Map(snap.scale.map((s) => [s.value, s]));
  const values: number[] = [];
  for (let v = 0; v <= snap.max; v += INTENSITY_STEP) values.push(v);
  sheet(
    SHEETS.scale,
    COLUMNS.scale,
    values.map((v) => ({
      value: v,
      title: described.get(v)?.title ?? "",
      description: described.get(v)?.description ?? "",
    })),
  );
  sheet(
    SHEETS.boundaries,
    COLUMNS.boundaries,
    snap.boundaries.map((b) => ({ ...b, description: b.description ?? "" })),
  );
  sheet(
    SHEETS.scenarios,
    COLUMNS.scenarios,
    snap.scenarios.map((s, i) => ({ id: s.id, name: s.name, order: i + 1 })),
  );
  // Acts by scenario, then level, then their place in the cell
  const scenarioOrder = new Map(snap.scenarios.map((s, i) => [s.id, i]));
  const acts = [...snap.acts].sort(
    (a, b) =>
      (scenarioOrder.get(a.scenarioId) ?? 0) -
        (scenarioOrder.get(b.scenarioId) ?? 0) ||
      a.level - b.level ||
      a.sortOrder - b.sortOrder,
  );
  const actsWs = sheet(
    SHEETS.acts,
    COLUMNS.acts,
    acts.map((a, i) => ({
      id: a.id,
      scenario: scenarioName.get(a.scenarioId),
      name: a.name,
      level: a.level,
      description: a.description ?? "",
      order: i + 1,
    })),
  );
  sheet(
    SHEETS.groups,
    COLUMNS.groups,
    snap.groups.map((g, i) => ({
      id: g.id,
      name: g.name,
      order: i + 1,
      notIn: list(g.offIn, scenarioName),
    })),
  );
  const extrasWs = sheet(
    SHEETS.extras,
    COLUMNS.extras,
    [...snap.extras]
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.points - b.points ||
          a.name.localeCompare(b.name),
      )
      .map((e, i) => ({
        id: e.id,
        name: e.name,
        points: e.isMax ? "" : e.points,
        group: e.groupId ? groupName.get(e.groupId) : "",
        notIn: e.groupId || e.isMax ? "" : list(e.offIn, scenarioName),
        isMax: e.isMax ? "yes" : "",
        order: i + 1,
      })),
  );
  const presetsWs = sheet(
    SHEETS.presets,
    COLUMNS.presets,
    snap.presets.map((p, i) => ({
      id: p.id,
      scenario: scenarioName.get(p.scenarioId),
      name: p.name,
      description: p.description ?? "",
      order: i + 1,
      acts: list(p.actIds, actName),
      extras: list(p.extraIds, extraName),
    })),
  );

  // Pick lists: an act's or preset's scenario, an extra's group
  const pick = (
    ws: ExcelJS.Worksheet,
    col: number,
    source: SheetName,
    n: number,
  ) => {
    const ref = `'${source}'!$B$2:$B$${Math.max(n + 50, 100)}`;
    // Fixed before the loop: touching a cell grows rowCount
    const last = ws.rowCount + 200;
    for (let r = 2; r <= last; r++) {
      ws.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
        showErrorMessage: false,
      };
    }
  };
  pick(actsWs, 2, SHEETS.scenarios, snap.scenarios.length);
  pick(presetsWs, 2, SHEETS.scenarios, snap.scenarios.length);
  pick(extrasWs, 4, SHEETS.groups, snap.groups.length);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function style(ws: ExcelJS.Worksheet) {
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8EE" },
  };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  // The id is for the import, not for reading
  const idCol = ws.columns.findIndex((c) => c.key === "id");
  if (idCol >= 0)
    ws.getColumn(idCol + 1).font = { color: { argb: "FF9A9AA6" }, size: 9 };
  ws.getRow(1).font = { bold: true };
}

// ─── Read ────────────────────────────────────────────────────────────────────

function cellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v)
      return (
        v.richText
          .map((t) => t.text)
          .join("")
          .trim() || null
      );
    if ("result" in v)
      return v.result === undefined || v.result === null
        ? null
        : String(v.result).trim() || null;
    if ("text" in v) return String(v.text).trim() || null;
  }
  return cell.text?.trim() || null;
}

/** A number, also when typed as text with a decimal comma ("2,5") */
function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (typeof v === "number") return v;
  if (
    v &&
    typeof v === "object" &&
    "result" in v &&
    typeof v.result === "number"
  )
    return v.result;
  const t = cellText(cell);
  if (t === null) return null;
  const n = Number(t.replace(",", ".").replace("−", "-"));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Reads the workbook into a CatalogFile. Columns are found by their header, so
 * they may be moved; a missing sheet or column is a problem, not a crash.
 */
export async function readCatalogWorkbook(
  buffer: Buffer,
): Promise<{ file: CatalogFile; problems: ImportProblem[] }> {
  const problems: ImportProblem[] = [];
  const file: CatalogFile = {
    max: null,
    scale: [],
    boundaries: [],
    scenarios: [],
    acts: [],
    groups: [],
    extras: [],
    presets: [],
  };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    problems.push({
      sheet: SHEETS.readme,
      message: "This is not an Excel workbook (.xlsx).",
    });
    return { file, problems };
  }

  /** The sheet's rows as header → cell, with their row number; null if the sheet or a column is missing */
  const rows = (name: SheetName, headers: string[]) => {
    const ws = wb.getWorksheet(name);
    if (!ws) {
      problems.push({
        sheet: name,
        message: `The sheet “${name}” is missing.`,
      });
      return null;
    }
    const at = new Map<string, number>();
    ws.getRow(1).eachCell((cell, col) => {
      const h = cellText(cell)?.toLowerCase();
      if (h) at.set(h, col);
    });
    const missing = headers.filter((h) => !at.has(h.toLowerCase()));
    if (missing.length) {
      problems.push({
        sheet: name,
        message: `Missing ${missing.length === 1 ? "column" : "columns"}: ${missing.join(", ")}.`,
      });
      return null;
    }
    const out: { row: number; get: (h: string) => ExcelJS.Cell }[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (h: string) => row.getCell(at.get(h.toLowerCase())!);
      if (headers.every((h) => cellText(get(h)) === null)) continue;
      out.push({ row: r, get });
    }
    return out;
  };
  const text = (c: ExcelJS.Cell) => cellText(c);
  const num = (c: ExcelJS.Cell) => cellNumber(c);
  const order = (c: ExcelJS.Cell) => {
    const n = cellNumber(c);
    return n === null || Number.isNaN(n) ? null : n;
  };
  const headers = (cols: Column[]) => cols.map((c) => c.header);

  const settings = rows(SHEETS.settings, ["Setting", "Value"]);
  if (settings) {
    const max = settings.find(
      (r) => text(r.get("Setting"))?.toLowerCase() === "max",
    );
    file.max = max ? num(max.get("Value")) : null;
  }
  file.scale =
    rows(SHEETS.scale, headers(COLUMNS.scale))?.map(({ row, get }) => ({
      row,
      value: num(get("Value")),
      title: text(get("Title")),
      description: text(get("Description")),
    })) ?? [];
  file.boundaries =
    rows(SHEETS.boundaries, headers(COLUMNS.boundaries))?.map(
      ({ row, get }) => ({
        row,
        id: text(get("Id")),
        value: num(get("At")),
        title: text(get("Title")),
        description: text(get("Description")),
      }),
    ) ?? [];
  file.scenarios =
    rows(SHEETS.scenarios, headers(COLUMNS.scenarios))?.map(({ row, get }) => ({
      row,
      id: text(get("Id")),
      name: text(get("Name")),
      order: order(get("Order")),
    })) ?? [];
  file.acts =
    rows(SHEETS.acts, headers(COLUMNS.acts))?.map(({ row, get }) => ({
      row,
      id: text(get("Id")),
      scenario: text(get("Scenario")),
      name: text(get("Name")),
      level: num(get("Level")),
      description: text(get("Description")),
      order: order(get("Order")),
    })) ?? [];
  file.groups =
    rows(SHEETS.groups, headers(COLUMNS.groups))?.map(({ row, get }) => ({
      row,
      id: text(get("Id")),
      name: text(get("Name")),
      order: order(get("Order")),
      notIn: splitList(text(get("Not counted in"))),
    })) ?? [];
  file.extras =
    rows(SHEETS.extras, headers(COLUMNS.extras))?.map(({ row, get }) => {
      const isMax = ["yes", "ja", "x", "true", "1"].includes(
        text(get("Max"))?.toLowerCase() ?? "",
      );
      return {
        row,
        id: text(get("Id")),
        name: text(get("Name")),
        // Max carries no points in the file
        points: isMax ? 0 : (num(get("Points")) ?? 0),
        group: text(get("Group")),
        notIn: splitList(text(get("Not counted in"))),
        isMax,
        order: order(get("Order")),
      };
    }) ?? [];
  file.presets =
    rows(SHEETS.presets, headers(COLUMNS.presets))?.map(({ row, get }) => ({
      row,
      id: text(get("Id")),
      scenario: text(get("Scenario")),
      name: text(get("Name")),
      description: text(get("Description")),
      order: order(get("Order")),
      acts: splitList(text(get("Acts"))),
      extras: splitList(text(get("Extras"))),
    })) ?? [];
  // NaN marks a cell that is not a number — the planner names it
  for (const r of file.scale) if (Number.isNaN(r.value)) r.value = null;
  for (const r of file.boundaries) if (Number.isNaN(r.value)) r.value = null;
  for (const r of file.acts) if (Number.isNaN(r.level)) r.level = null;
  for (const r of file.extras) if (Number.isNaN(r.points)) r.points = null;
  if (file.max !== null && Number.isNaN(file.max)) file.max = null;
  return { file, problems };
}

// ─── Preview and apply ───────────────────────────────────────────────────────

export type CatalogImportPreview = Pick<
  ImportPlan,
  "problems" | "changes" | "kept"
> & { fingerprint: string };

async function planFromBuffer(buffer: Buffer) {
  const [{ file, problems: readProblems }, snapshot] = await Promise.all([
    readCatalogWorkbook(buffer),
    getCatalogSnapshot(),
  ]);
  const fingerprint = catalogFingerprint(snapshot);
  if (readProblems.length) {
    return {
      plan: null,
      preview: { problems: readProblems, changes: [], kept: [], fingerprint },
    };
  }
  const plan = planCatalogImport(snapshot, file);
  plan.problems.push(...(await groupProblems(plan)));
  return {
    plan,
    preview: {
      problems: plan.problems,
      changes: plan.changes,
      kept: plan.kept,
      fingerprint,
    },
  };
}

/**
 * A group allows one of its extras per person in a session (and per act). The
 * file may put extras together that sessions already hold side by side — both
 * would count. Checked over the final groups, all at once.
 */
async function groupProblems(plan: ImportPlan): Promise<ImportProblem[]> {
  if (!plan.groupMembers.length) return [];
  const values = Prisma.join(
    plan.groupMembers.map((m) => Prisma.sql`(${m.extraId}, ${m.groupKey})`),
  );
  const rows = await prisma.$queryRaw<{ grp: string; n: bigint }[]>`
    WITH m(extra_id, grp) AS (VALUES ${values})
    SELECT grp, count(*) AS n FROM (
      SELECT ce."contributionId", m.grp FROM "ContributionExtra" ce JOIN m ON m.extra_id = ce."extraId"
      GROUP BY 1, 2 HAVING count(*) > 1
      UNION ALL
      SELECT ae."contributionActId", m.grp FROM "ContributionActExtra" ae JOIN m ON m.extra_id = ae."extraId"
      WHERE ae.mode = 'ADD'
      GROUP BY 1, 2 HAVING count(*) > 1
    ) x GROUP BY grp`;
  const name = new Map(plan.groups.map((g) => [g.key, g.name]));
  return rows.map((r) => ({
    sheet: SHEETS.extras,
    message: `Sessions hold two extras of the group “${name.get(r.grp) ?? "?"}” together ${Number(r.n) === 1 ? "once" : `${r.n} times`} — keep them apart or take one off first.`,
  }));
}

export async function previewCatalogImport(
  buffer: Buffer,
): Promise<CatalogImportPreview> {
  return (await planFromBuffer(buffer)).preview;
}

/** Applies the file — only when it has no problems and the catalog is still as previewed */
export async function applyCatalogImport(
  buffer: Buffer,
  fingerprint: string,
): Promise<CatalogImportPreview> {
  const { plan, preview } = await planFromBuffer(buffer);
  if (!plan || preview.problems.length)
    throw new Error("The file has problems — open the preview again.");
  if (preview.fingerprint !== fingerprint)
    throw new Error(
      "The catalog changed since the preview — import the file again to see what it does now.",
    );

  await prisma.$transaction(
    async (tx) => {
      const tmp = (id: string) => `__import__${id}`;
      const ids = new Map<string, string>(); // plan key → id
      const idOf = (key: string) => ids.get(key) ?? key;

      await tx.setting.upsert({
        where: { key: INTENSITY_MAX_KEY },
        update: { value: String(plan.max) },
        create: { key: INTENSITY_MAX_KEY, value: String(plan.max) },
      });

      await tx.intensityScaleStep.deleteMany({});
      if (plan.scale.length)
        await tx.intensityScaleStep.createMany({ data: plan.scale });

      // Boundaries hold a unique value: move the kept ones aside, then into place
      await tx.intensityBoundary.deleteMany({
        where: { id: { in: plan.remove.boundaries } },
      });
      const keptBoundaries = plan.boundaries.filter((b) => b.id);
      for (const [i, b] of keptBoundaries.entries())
        await tx.intensityBoundary.update({
          where: { id: b.id! },
          data: { value: -1 - i },
        });
      for (const b of plan.boundaries) {
        const data = {
          value: b.value,
          title: b.title,
          description: b.description,
        };
        if (b.id)
          await tx.intensityBoundary.update({ where: { id: b.id }, data });
        else await tx.intensityBoundary.create({ data });
      }

      // Names are unique: every renamed row steps aside first, so two can swap
      for (const s of plan.scenarios)
        if (s.id)
          await tx.intensityScenario.update({
            where: { id: s.id },
            data: { name: tmp(s.id) },
          });
      for (const g of plan.groups)
        if (g.id)
          await tx.intensityExtraGroup.update({
            where: { id: g.id },
            data: { name: tmp(g.id) },
          });
      for (const e of plan.extras)
        if (e.id)
          await tx.intensityExtra.update({
            where: { id: e.id },
            data: { name: tmp(e.id) },
          });
      for (const a of plan.acts)
        if (a.id)
          await tx.intensityAct.update({
            where: { id: a.id },
            data: { name: tmp(a.id) },
          });
      for (const p of plan.presets)
        if (p.id)
          await tx.intensityPreset.update({
            where: { id: p.id },
            data: { name: tmp(p.id) },
          });

      for (const s of plan.scenarios) {
        const data = { name: s.name, sortOrder: s.sortOrder };
        if (s.id)
          await tx.intensityScenario.update({ where: { id: s.id }, data });
        else ids.set(s.key, (await tx.intensityScenario.create({ data })).id);
      }
      for (const g of plan.groups) {
        const data = { name: g.name, sortOrder: g.sortOrder };
        const id = g.id ?? (await tx.intensityExtraGroup.create({ data })).id;
        if (g.id) await tx.intensityExtraGroup.update({ where: { id }, data });
        ids.set(g.key, id);
        await tx.intensityExtraGroupScenarioOff.deleteMany({
          where: { groupId: id },
        });
        if (g.offIn.length) {
          await tx.intensityExtraGroupScenarioOff.createMany({
            data: g.offIn.map((k) => ({ groupId: id, scenarioId: idOf(k) })),
          });
        }
      }
      for (const e of plan.extras) {
        const data = e.isMax
          ? { name: e.name, sortOrder: e.sortOrder }
          : {
              name: e.name,
              sortOrder: e.sortOrder,
              points: e.points,
              groupId: e.groupKey ? idOf(e.groupKey) : null,
            };
        const id = e.id ?? (await tx.intensityExtra.create({ data })).id;
        if (e.id) await tx.intensityExtra.update({ where: { id }, data });
        ids.set(e.key, id);
        await tx.intensityExtraScenarioOff.deleteMany({
          where: { extraId: id },
        });
        if (!e.groupKey && e.offIn.length) {
          await tx.intensityExtraScenarioOff.createMany({
            data: e.offIn.map((k) => ({ extraId: id, scenarioId: idOf(k) })),
          });
        }
      }
      for (const a of plan.acts) {
        const data = {
          scenarioId: idOf(a.scenarioKey),
          name: a.name,
          level: a.level,
          description: a.description,
          sortOrder: a.sortOrder,
        };
        if (a.id) await tx.intensityAct.update({ where: { id: a.id }, data });
        else ids.set(a.key, (await tx.intensityAct.create({ data })).id);
      }
      for (const p of plan.presets) {
        const data = {
          scenarioId: idOf(p.scenarioKey),
          name: p.name,
          description: p.description,
          sortOrder: p.sortOrder,
        };
        const id = p.id ?? (await tx.intensityPreset.create({ data })).id;
        if (p.id) await tx.intensityPreset.update({ where: { id }, data });
        await tx.intensityPresetAct.deleteMany({ where: { presetId: id } });
        await tx.intensityPresetExtra.deleteMany({ where: { presetId: id } });
        if (p.actKeys.length)
          await tx.intensityPresetAct.createMany({
            data: p.actKeys.map((k) => ({ presetId: id, actId: idOf(k) })),
          });
        if (p.extraKeys.length)
          await tx.intensityPresetExtra.createMany({
            data: p.extraKeys.map((k) => ({ presetId: id, extraId: idOf(k) })),
          });
      }

      // What the file leaves out and nothing uses
      await tx.intensityPreset.deleteMany({
        where: { id: { in: plan.remove.presets } },
      });
      await tx.intensityAct.deleteMany({
        where: { id: { in: plan.remove.acts } },
      });
      await tx.intensityExtra.deleteMany({
        where: { id: { in: plan.remove.extras } },
      });
      await tx.intensityExtraGroup.deleteMany({
        where: { id: { in: plan.remove.groups } },
      });
      await tx.intensityScenario.deleteMany({
        where: { id: { in: plan.remove.scenarios } },
      });

      // Saved filters and Smart Collections follow the renames — in two steps
      // through a placeholder, like the names above, so a swap does not undo itself
      const hold = (id: string) => `__import__${id}`;
      for (const r of plan.renames.scenarios)
        await rewriteSavedQueries(tx, {
          kind: "scenario",
          from: r.from,
          to: hold(r.id),
        });
      for (const r of plan.renames.scenarios)
        await rewriteSavedQueries(tx, {
          kind: "scenario",
          from: hold(r.id),
          to: r.to,
        });
      // An act's scenario may have been renamed just above
      const scenarioNow = new Map(
        plan.renames.scenarios.map((r) => [r.from, r.to]),
      );
      for (const r of plan.renames.acts) {
        const nameStaysTaken =
          (await tx.intensityAct.count({
            where: { name: { equals: r.from, mode: "insensitive" } },
          })) > 0;
        const scenario = scenarioNow.get(r.scenario) ?? r.scenario;
        await rewriteSavedQueries(tx, {
          kind: "act",
          scenario,
          from: r.from,
          to: hold(r.id),
          nameStaysTaken,
        });
      }
      for (const r of plan.renames.acts) {
        const scenario = scenarioNow.get(r.scenario) ?? r.scenario;
        await rewriteSavedQueries(tx, {
          kind: "act",
          scenario,
          from: hold(r.id),
          to: r.to,
          nameStaysTaken: false,
        });
      }
    },
    { timeout: 60_000 },
  );
  return preview;
}

/** "intensity-catalog-xpulse-2026-10-26.xlsx" */
export function catalogFileName(tenant: string): string {
  return `intensity-catalog-${tenant}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
