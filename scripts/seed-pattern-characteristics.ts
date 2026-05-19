import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

type DefinitionSeed = { name: string; unit?: string | null };
type GroupSeed = { name: string; definitions: DefinitionSeed[] };

const GROUPS: GroupSeed[] = [
  {
    name: "Hair Features",
    definitions: [
      // Pattern attribute — single value (one of the patterns below)
      { name: "Hair Pattern", unit: "solid | highlights | lowlights | ombre | balayage | two-tone | money-piece | frosted-tips" },
      // Boolean-style characteristics — each stored as its own definition,
      // value "yes" when present (absence = no). The sidebar surfaces them as
      // multi-select boolean toggles in a "Characteristics" section.
      { name: "Graying", unit: "yes" },
      { name: "Roots Showing", unit: "yes" },
      { name: "Poliosis", unit: "yes" },
    ],
  },
  {
    name: "Eye Features",
    definitions: [
      { name: "Eye Pattern", unit: "solid | complete-heterochromia | central-heterochromia | sectoral-heterochromia" },
      { name: "Limbal Ring", unit: "yes" },
      { name: "Brushfield Spots", unit: "yes" },
    ],
  },
];

async function upsertGroup(name: string, sortOrder: number): Promise<string> {
  const existing = await prisma.physicalAttributeGroup.findUnique({
    where: { name },
  });
  if (existing) return existing.id;
  const created = await prisma.physicalAttributeGroup.create({
    data: { name, sortOrder },
  });
  return created.id;
}

async function upsertDefinition(
  groupId: string,
  def: DefinitionSeed,
  sortOrder: number,
): Promise<{ created: boolean; slug: string }> {
  const slug = slugify(def.name);
  const existing = await prisma.physicalAttributeDefinition.findUnique({
    where: { slug },
  });
  if (existing) return { created: false, slug };
  await prisma.physicalAttributeDefinition.create({
    data: {
      groupId,
      name: def.name,
      slug,
      unit: def.unit ?? null,
      sortOrder,
    },
  });
  return { created: true, slug };
}

async function main() {
  console.log("=== Seeding Hair / Eye pattern + characteristic attributes ===");
  let groupOrder = 100;
  for (const g of GROUPS) {
    const groupId = await upsertGroup(g.name, groupOrder++);
    console.log(`\nGroup "${g.name}" (${groupId})`);
    let defOrder = 0;
    for (const d of g.definitions) {
      const { created, slug } = await upsertDefinition(groupId, d, defOrder++);
      console.log(`  ${created ? "+" : "·"} ${d.name}  [slug: ${slug}]`);
    }
  }
  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
