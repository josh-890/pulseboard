import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureCatalogEntry } from "../src/lib/services/color-catalog-service";
import { rebuildAllCurrentState } from "../src/lib/services/current-state-service";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type Stats = {
  alreadyMapped: number;
  autoAdded: number;
  unmappedExamples: { value: string; inferredHue: string; inferredShade: string | null }[];
};

async function backfillCategory(
  category: "hair" | "eye" | "skin",
  values: string[],
): Promise<Stats> {
  const distinct = Array.from(new Set(values.map((v) => v.trim().toLowerCase()))).filter(Boolean);
  let alreadyMapped = 0;
  let autoAdded = 0;
  const newSamples: { value: string; inferredHue: string; inferredShade: string | null }[] = [];

  for (const v of distinct) {
    const existing = await prisma.colorCatalog.findUnique({
      where: { category_valueNorm: { category, valueNorm: v } },
    });
    if (existing) {
      alreadyMapped++;
      continue;
    }
    await ensureCatalogEntry(category, v);
    const newEntry = await prisma.colorCatalog.findUnique({
      where: { category_valueNorm: { category, valueNorm: v } },
    });
    autoAdded++;
    if (newEntry && newSamples.length < 20) {
      newSamples.push({ value: v, inferredHue: newEntry.hue, inferredShade: newEntry.shade });
    }
  }
  return { alreadyMapped, autoAdded, unmappedExamples: newSamples };
}

async function main() {
  console.log("=== Color-value migration ===\n");

  // Gather all distinct values per category
  const hairRows = await prisma.$queryRawUnsafe<{ v: string }[]>(`
    SELECT DISTINCT lower(trim("naturalHairColor")) AS v FROM "Person" WHERE "naturalHairColor" IS NOT NULL AND trim("naturalHairColor") <> ''
    UNION
    SELECT DISTINCT lower(trim("currentHairColor")) AS v FROM "PersonaPhysical" WHERE "currentHairColor" IS NOT NULL AND trim("currentHairColor") <> ''
  `);
  const eyeRows = await prisma.$queryRawUnsafe<{ v: string }[]>(`
    SELECT DISTINCT lower(trim("eyeColor")) AS v FROM "Person" WHERE "eyeColor" IS NOT NULL AND trim("eyeColor") <> ''
  `);
  const skinRows = await prisma.$queryRawUnsafe<{ v: string }[]>(`
    SELECT DISTINCT lower(trim(ppa.value)) AS v
    FROM "PersonaPhysicalAttribute" ppa
    JOIN "PhysicalAttributeDefinition" pad ON pad.id = ppa."attributeDefinitionId"
    WHERE pad.slug = 'skin_tone'
      AND ppa.value IS NOT NULL AND trim(ppa.value) <> ''
  `);

  const hairStats = await backfillCategory("hair", hairRows.map((r) => r.v));
  const eyeStats  = await backfillCategory("eye",  eyeRows.map((r) => r.v));
  const skinStats = await backfillCategory("skin", skinRows.map((r) => r.v));

  console.log(`HAIR  — already mapped: ${hairStats.alreadyMapped}, auto-added: ${hairStats.autoAdded}`);
  if (hairStats.unmappedExamples.length > 0) {
    console.log("  auto-added (sample):");
    for (const s of hairStats.unmappedExamples) {
      console.log(`    "${s.value}" → ${s.inferredHue} / ${s.inferredShade ?? "—"}`);
    }
  }

  console.log(`EYE   — already mapped: ${eyeStats.alreadyMapped}, auto-added: ${eyeStats.autoAdded}`);
  if (eyeStats.unmappedExamples.length > 0) {
    console.log("  auto-added (sample):");
    for (const s of eyeStats.unmappedExamples) {
      console.log(`    "${s.value}" → ${s.inferredHue} / ${s.inferredShade ?? "—"}`);
    }
  }

  console.log(`SKIN  — already mapped: ${skinStats.alreadyMapped}, auto-added: ${skinStats.autoAdded}`);
  if (skinStats.unmappedExamples.length > 0) {
    console.log("  auto-added (sample):");
    for (const s of skinStats.unmappedExamples) {
      console.log(`    "${s.value}" → ${s.inferredHue} / ${s.inferredShade ?? "—"}`);
    }
  }

  console.log("\nRebuilding PersonCurrentState cache…");
  await rebuildAllCurrentState();
  console.log("Done. Review auto-added entries in Settings → Catalogs → Colors → Needs review.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
