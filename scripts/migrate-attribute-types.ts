import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// "yes" / "yes/no" / "yes | no" -> BOOLEAN
const BOOLEAN_PATTERN = /^\s*(yes|yes\s*[/|]\s*no|no\s*[/|]\s*yes)\s*$/i;

// "a | b | c" (at least one pipe) -> SINGLE_SELECT
const PIPE_LIST_PATTERN = /\|/;

// Common physical units -> NUMERIC (we keep the unit string)
const UNIT_PATTERN = /^(kg|g|lb|lbs|cm|mm|m|inch|in|yrs|years|°c|°f|%)$/i;

type Inferred = {
  valueType: "BOOLEAN" | "SINGLE_SELECT" | "NUMERIC" | "TEXT";
  allowedValues: string[];
  clearUnit: boolean;
};

function infer(unit: string | null): Inferred {
  if (!unit) return { valueType: "TEXT", allowedValues: [], clearUnit: false };
  const trimmed = unit.trim();
  if (BOOLEAN_PATTERN.test(trimmed)) {
    return { valueType: "BOOLEAN", allowedValues: [], clearUnit: true };
  }
  if (PIPE_LIST_PATTERN.test(trimmed)) {
    const values = trimmed
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    return { valueType: "SINGLE_SELECT", allowedValues: values, clearUnit: true };
  }
  if (UNIT_PATTERN.test(trimmed)) {
    return { valueType: "NUMERIC", allowedValues: [], clearUnit: false };
  }
  return { valueType: "TEXT", allowedValues: [], clearUnit: false };
}

async function main() {
  console.log("=== Auto-detect PhysicalAttribute valueTypes from `unit` ===\n");

  const defs = await prisma.physicalAttributeDefinition.findMany({
    orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
    include: { group: { select: { name: true } } },
  });

  let booleanCount = 0;
  let singleSelectCount = 0;
  let numericCount = 0;
  let textCount = 0;
  let skipped = 0;

  for (const def of defs) {
    // Skip if already typed (idempotency)
    if (def.valueType !== "TEXT" || def.allowedValues.length > 0) {
      skipped++;
      console.log(`· ${def.group.name} / ${def.name}  (already ${def.valueType}, skip)`);
      continue;
    }

    const inferred = infer(def.unit);

    await prisma.physicalAttributeDefinition.update({
      where: { id: def.id },
      data: {
        valueType: inferred.valueType,
        allowedValues: inferred.allowedValues,
        unit: inferred.clearUnit ? null : def.unit,
      },
    });

    const tag =
      inferred.valueType === "BOOLEAN"       ? "BOOLEAN"
      : inferred.valueType === "SINGLE_SELECT" ? `SINGLE_SELECT (${inferred.allowedValues.length})`
      : inferred.valueType === "NUMERIC"     ? `NUMERIC (${def.unit ?? ""})`
      :                                        "TEXT";
    console.log(`+ ${def.group.name} / ${def.name}  →  ${tag}`);

    switch (inferred.valueType) {
      case "BOOLEAN":       booleanCount++; break;
      case "SINGLE_SELECT": singleSelectCount++; break;
      case "NUMERIC":       numericCount++; break;
      case "TEXT":          textCount++; break;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  BOOLEAN:       ${booleanCount}`);
  console.log(`  SINGLE_SELECT: ${singleSelectCount}`);
  console.log(`  NUMERIC:       ${numericCount}`);
  console.log(`  TEXT (left):   ${textCount}`);
  console.log(`  already typed: ${skipped}`);
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
