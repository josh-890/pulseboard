import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import ExcelJS from "exceljs";

// Applying a catalog workbook (2026-10-26). An import rewrites the WHOLE
// catalog, and the dev catalog is real — so this runs on a scratch database
// with dev's schema and no data: `pulseboard_xfer_test` on the dev server. It
// is skipped when that database does not exist. Create it with:
//
//   psql "$DEV" -c "CREATE DATABASE pulseboard_xfer_test"
//   pg_dump --schema-only --no-owner --no-privileges "$DEV" | psql "<dev url>/pulseboard_xfer_test"
//
// (after a migration, drop and recreate it the same way).

const SCRATCH_DB = "pulseboard_xfer_test";
const scratchUrl = (process.env.DATABASE_URL ?? "").replace(
  /\/[^/?]+(\?|$)/,
  `/${SCRATCH_DB}$1`,
);

async function scratchExists(): Promise<boolean> {
  const c = new Client({ connectionString: scratchUrl });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const available = await scratchExists();

// The services must reach the scratch database and nothing else: a tenant of
// their own, registered before any of them is loaded (and only when it exists)
if (available) {
  process.env.TENANT_REGISTRY = "xfertest";
  process.env.TENANT_XFERTEST_DATABASE_URL = scratchUrl;
  process.env.TENANT_XFERTEST_MINIO_BUCKET = "unused";
}

type Services = {
  prisma: typeof import("@/lib/db").prisma;
  runWithTenant: typeof import("@/lib/tenant-context").runWithTenant;
  transfer: typeof import("@/lib/services/intensity-catalog-transfer-service");
};
let s: Services;
const inTenant = <T>(fn: () => Promise<T>) => s.runWithTenant("xfertest", fn);

describe.skipIf(!available)(
  "applying a catalog workbook (scratch database)",
  () => {
    beforeAll(async () => {
      s = {
        prisma: (await import("@/lib/db")).prisma,
        runWithTenant: (await import("@/lib/tenant-context")).runWithTenant,
        transfer:
          await import("@/lib/services/intensity-catalog-transfer-service"),
      };
      const [{ db }] = await inTenant(
        () =>
          s.prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`,
      );
      // Never anywhere else
      if (db !== SCRATCH_DB) throw new Error(`Refusing to run on ${db}`);
    });

    afterAll(async () => {
      if (available) await inTenant(() => wipe());
      for (const k of [
        "TENANT_REGISTRY",
        "TENANT_XFERTEST_DATABASE_URL",
        "TENANT_XFERTEST_MINIO_BUCKET",
      ]) {
        delete process.env[k];
      }
    });

    async function wipe() {
      const p = s.prisma;
      await p.contributionAct.deleteMany({});
      await p.contributionExtra.deleteMany({});
      await p.sessionContribution.deleteMany({});
      await p.session.deleteMany({});
      await p.person.deleteMany({});
      await p.contributionRoleDefinition.deleteMany({});
      await p.contributionRoleGroup.deleteMany({});
      await p.savedFilter.deleteMany({});
      await p.intensityPreset.deleteMany({});
      await p.intensityExtra.deleteMany({});
      await p.intensityExtraGroup.deleteMany({});
      await p.intensityAct.deleteMany({});
      await p.intensityScenario.deleteMany({});
      await p.intensityBoundary.deleteMany({});
      await p.intensityScaleStep.deleteMany({});
      await p.setting.deleteMany({});
    }

    /** Solo (Topless 2, Full nude 3), Duo (Kiss 1); Place: Outdoor 1, Beach 1.5; preset Art; Max 10 */
    async function seed() {
      const p = s.prisma;
      await p.setting.create({ data: { key: "intensity-max", value: "10" } });
      await p.intensityScaleStep.create({ data: { value: 3, title: "Bold" } });
      await p.intensityBoundary.create({ data: { value: 4.5, title: "Nude" } });
      const solo = await p.intensityScenario.create({
        data: { name: "Solo", sortOrder: 0 },
      });
      const duo = await p.intensityScenario.create({
        data: { name: "Duo", sortOrder: 1 },
      });
      const topless = await p.intensityAct.create({
        data: { scenarioId: solo.id, name: "Topless", level: 2 },
      });
      const nude = await p.intensityAct.create({
        data: { scenarioId: solo.id, name: "Full nude", level: 3 },
      });
      const kiss = await p.intensityAct.create({
        data: { scenarioId: duo.id, name: "Kiss", level: 1 },
      });
      const place = await p.intensityExtraGroup.create({
        data: { name: "Place" },
      });
      await p.intensityExtra.create({ data: { name: "Max", isMax: true } });
      const outdoor = await p.intensityExtra.create({
        data: { name: "Outdoor", points: 1, groupId: place.id, sortOrder: 1 },
      });
      const beach = await p.intensityExtra.create({
        data: { name: "Beach", points: 1.5, groupId: place.id, sortOrder: 2 },
      });
      await p.intensityPreset.create({
        data: {
          scenarioId: solo.id,
          name: "Art",
          acts: { create: [{ actId: topless.id }] },
          extras: { create: [{ extraId: outdoor.id }] },
        },
      });
      await p.savedFilter.create({
        data: {
          scope: "sessions",
          name: "Toplessness",
          params: "tags=act%3ASolo%2FTopless",
        },
      });
      return { solo, duo, topless, nude, kiss, place, outdoor, beach };
    }

    /** Someone did `actId` in a session, with `extraIds` */
    async function tick(actId: string, extraIds: string[] = []) {
      const p = s.prisma;
      const group = await p.contributionRoleGroup.upsert({
        where: { id: "g" },
        update: {},
        create: { id: "g", name: "On camera" },
      });
      await p.contributionRoleDefinition.upsert({
        where: { id: "crd" },
        update: {},
        create: { id: "crd", groupId: group.id, name: "Model", slug: "model" },
      });
      const person = await p.person.create({
        data: { icgId: `XF-${Math.random().toString(36).slice(2, 8)}` },
      });
      const session = await p.session.create({ data: { name: "S" } });
      const c = await p.sessionContribution.create({
        data: {
          sessionId: session.id,
          personId: person.id,
          roleDefinitionId: "crd",
        },
      });
      await p.contributionAct.create({ data: { contributionId: c.id, actId } });
      for (const extraId of extraIds)
        await p.contributionExtra.create({
          data: { contributionId: c.id, extraId },
        });
    }

    /** The current export, edited sheet by sheet */
    async function edited(
      edit: (wb: ExcelJS.Workbook) => void,
    ): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(
        (await inTenant(() =>
          s.transfer.exportCatalogWorkbook(),
        )) as unknown as ExcelJS.Buffer,
      );
      edit(wb);
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    /** The row whose column `col` (by header) reads `value` */
    function row(
      wb: ExcelJS.Workbook,
      sheet: string,
      col: string,
      value: string,
    ): ExcelJS.Row {
      const ws = wb.getWorksheet(sheet)!;
      const c = colOf(ws, col);
      for (let r = 2; r <= ws.rowCount; r++)
        if (String(ws.getRow(r).getCell(c).value ?? "") === value)
          return ws.getRow(r);
      throw new Error(`${sheet}: no ${col} “${value}”`);
    }
    function colOf(ws: ExcelJS.Worksheet, header: string): number {
      let at = 0;
      ws.getRow(1).eachCell((cell, n) => {
        if (cell.value === header) at = n;
      });
      if (!at) throw new Error(`${ws.name}: no column ${header}`);
      return at;
    }
    const set = (
      wb: ExcelJS.Workbook,
      sheet: string,
      r: ExcelJS.Row,
      col: string,
      value: ExcelJS.CellValue,
    ) => (r.getCell(colOf(wb.getWorksheet(sheet)!, col)).value = value);
    const add = (
      wb: ExcelJS.Workbook,
      sheet: string,
      values: Record<string, ExcelJS.CellValue>,
    ) => {
      const ws = wb.getWorksheet(sheet)!;
      const r = ws.getRow(ws.actualRowCount + 1);
      for (const [k, v] of Object.entries(values))
        r.getCell(colOf(ws, k)).value = v;
    };

    /** Every row below the header emptied, as deleting them in Excel does */
    function clearRows(ws: ExcelJS.Worksheet) {
      for (let r = 2; r <= ws.rowCount; r++)
        ws.getRow(r).eachCell((cell) => (cell.value = null));
    }

    async function importFile(buffer: Buffer) {
      const preview = await inTenant(() =>
        s.transfer.previewCatalogImport(buffer),
      );
      expect(preview.problems).toEqual([]);
      await inTenant(() =>
        s.transfer.applyCatalogImport(buffer, preview.fingerprint),
      );
      return preview;
    }

    beforeEach(async () => {
      await inTenant(() => wipe());
    });

    it("applies renames (two acts swapping names too), additions, removals, scale, boundaries and Max in one go", async () => {
      const seeded = await inTenant(() => seed());
      const file = await edited((wb) => {
        set(wb, "Settings", row(wb, "Settings", "Setting", "Max"), "Value", 12);
        set(wb, "Scale", row(wb, "Scale", "Title", "Bold"), "Title", "Daring");
        set(wb, "Boundaries", row(wb, "Boundaries", "Title", "Nude"), "At", 5);
        // The scenario renamed, and every sheet naming it
        set(
          wb,
          "Scenarios",
          row(wb, "Scenarios", "Name", "Solo"),
          "Name",
          "Alone",
        );
        for (const sheet of ["Acts", "Presets"]) {
          const ws = wb.getWorksheet(sheet)!;
          const c = colOf(ws, "Scenario");
          for (let r = 2; r <= ws.rowCount; r++)
            if (ws.getRow(r).getCell(c).value === "Solo")
              ws.getRow(r).getCell(c).value = "Alone";
        }
        // Two acts trade names: the same entries, so the preset keeps its act
        const topless = row(wb, "Acts", "Name", "Topless");
        const nude = row(wb, "Acts", "Name", "Full nude");
        set(wb, "Acts", topless, "Name", "Full nude");
        set(wb, "Acts", nude, "Name", "Topless");
        set(
          wb,
          "Presets",
          row(wb, "Presets", "Name", "Art"),
          "Acts",
          "Full nude",
        );
        // Kiss goes, Hug comes
        wb.getWorksheet("Acts")!.spliceRows(
          row(wb, "Acts", "Name", "Kiss").number,
          1,
        );
        add(wb, "Acts", { Scenario: "Duo", Name: "Hug", Level: 0.5 });
        // A new group takes Beach
        add(wb, "Extra groups", { Name: "Light", "Not counted in": "Duo" });
        set(wb, "Extras", row(wb, "Extras", "Name", "Beach"), "Group", "Light");
        add(wb, "Presets", { Scenario: "Duo", Name: "Pair", Acts: "Hug" });
      });

      const preview = await importFile(file);
      expect(preview.changes.length).toBeGreaterThan(5);

      await inTenant(async () => {
        const p = s.prisma;
        expect(
          (await p.setting.findUnique({ where: { key: "intensity-max" } }))
            ?.value,
        ).toBe("12");
        expect(
          await p.intensityScaleStep.findMany({
            select: { value: true, title: true },
          }),
        ).toEqual([{ value: 3, title: "Daring" }]);
        expect(
          await p.intensityBoundary.findMany({
            select: { value: true, title: true },
          }),
        ).toEqual([{ value: 5, title: "Nude" }]);
        expect(
          (
            await p.intensityScenario.findUnique({
              where: { id: seeded.solo.id },
            })
          )?.name,
        ).toBe("Alone");
        // Same ids, traded names
        expect(
          (
            await p.intensityAct.findUnique({
              where: { id: seeded.topless.id },
            })
          )?.name,
        ).toBe("Full nude");
        expect(
          (await p.intensityAct.findUnique({ where: { id: seeded.nude.id } }))
            ?.name,
        ).toBe("Topless");
        expect(
          await p.intensityAct.findUnique({ where: { id: seeded.kiss.id } }),
        ).toBeNull();
        const hug = await p.intensityAct.findFirstOrThrow({
          where: { name: "Hug" },
        });
        expect(hug).toMatchObject({ scenarioId: seeded.duo.id, level: 0.5 });
        const art = await p.intensityPreset.findFirstOrThrow({
          where: { name: "Art" },
          include: { acts: true, extras: true },
        });
        expect(art.acts.map((a) => a.actId)).toEqual([seeded.topless.id]);
        expect(art.extras.map((e) => e.extraId)).toEqual([seeded.outdoor.id]);
        const pair = await p.intensityPreset.findFirstOrThrow({
          where: { name: "Pair" },
          include: { acts: true },
        });
        expect(pair).toMatchObject({ scenarioId: seeded.duo.id });
        expect(pair.acts.map((a) => a.actId)).toEqual([hug.id]);
        const light = await p.intensityExtraGroup.findFirstOrThrow({
          where: { name: "Light" },
          include: { scenariosOff: true },
        });
        expect(light.scenariosOff.map((o) => o.scenarioId)).toEqual([
          seeded.duo.id,
        ]);
        expect(
          (
            await p.intensityExtra.findUnique({
              where: { id: seeded.beach.id },
            })
          )?.groupId,
        ).toBe(light.id);
        // The saved filter follows the scenario and the act it named (Topless → Full nude, same act)
        const filter = await p.savedFilter.findFirstOrThrow({
          where: { name: "Toplessness" },
        });
        expect(new URLSearchParams(filter.params).get("tags")).toBe(
          'act:"Alone/Full nude"',
        );
      });

      // What is in the catalog now is what the file said: its export is no change
      const again = await inTenant(async () =>
        s.transfer.previewCatalogImport(
          await s.transfer.exportCatalogWorkbook(),
        ),
      );
      expect(again.problems).toEqual([]);
      expect(again.changes).toEqual([]);
    });

    it("keeps what sessions use and removes the rest", async () => {
      const seeded = await inTenant(() => seed());
      await inTenant(() => tick(seeded.topless.id, [seeded.outdoor.id]));
      const file = await edited((wb) => {
        for (const sheet of ["Acts", "Presets", "Scenarios"])
          clearRows(wb.getWorksheet(sheet)!);
        const extras = wb.getWorksheet("Extras")!;
        extras.spliceRows(row(wb, "Extras", "Name", "Beach").number, 1);
        extras.spliceRows(row(wb, "Extras", "Name", "Outdoor").number, 1);
      });
      const preview = await importFile(file);
      expect(preview.kept.map((k) => k.label).sort()).toEqual([
        "Outdoor",
        "Solo",
        "Topless (Solo)",
      ]);
      await inTenant(async () => {
        const p = s.prisma;
        expect(
          (await p.intensityAct.findMany({ select: { id: true } })).map(
            (a) => a.id,
          ),
        ).toEqual([seeded.topless.id]);
        expect(
          (await p.intensityScenario.findMany({ select: { name: true } })).map(
            (x) => x.name,
          ),
        ).toEqual(["Solo"]);
        expect(
          (
            await p.intensityExtra.findMany({
              orderBy: { name: "asc" },
              select: { name: true },
            })
          ).map((x) => x.name),
        ).toEqual(["Max", "Outdoor"]);
        expect(await p.intensityPreset.count()).toBe(0);
      });
    });

    it("applies only over the catalog it previewed", async () => {
      const seeded = await inTenant(() => seed());
      const file = await edited((wb) =>
        set(wb, "Acts", row(wb, "Acts", "Name", "Kiss"), "Level", 1.5),
      );
      const preview = await inTenant(() =>
        s.transfer.previewCatalogImport(file),
      );
      await inTenant(() =>
        s.prisma.intensityAct.update({
          where: { id: seeded.kiss.id },
          data: { description: "edited meanwhile" },
        }),
      );
      await expect(
        inTenant(() =>
          s.transfer.applyCatalogImport(file, preview.fingerprint),
        ),
      ).rejects.toThrow("The catalog changed since the preview");
      expect(
        (
          await inTenant(() =>
            s.prisma.intensityAct.findUniqueOrThrow({
              where: { id: seeded.kiss.id },
            }),
          )
        ).level,
      ).toBe(1);
    });

    it("refuses to group two extras a session holds together", async () => {
      const seeded = await inTenant(() => seed());
      await inTenant(() =>
        s.prisma.intensityExtra.updateMany({
          where: { id: { in: [seeded.outdoor.id, seeded.beach.id] } },
          data: { groupId: null },
        }),
      );
      await inTenant(() =>
        tick(seeded.kiss.id, [seeded.outdoor.id, seeded.beach.id]),
      );
      const file = await edited((wb) => {
        set(
          wb,
          "Extras",
          row(wb, "Extras", "Name", "Outdoor"),
          "Group",
          "Place",
        );
        set(wb, "Extras", row(wb, "Extras", "Name", "Beach"), "Group", "Place");
      });
      const preview = await inTenant(() =>
        s.transfer.previewCatalogImport(file),
      );
      expect(preview.problems.map((p) => p.message)).toEqual([
        "Sessions hold two extras of the group “Place” together once — keep them apart or take one off first.",
      ]);
    });
  },
);
