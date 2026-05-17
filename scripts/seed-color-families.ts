import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildColorFamilyMapRows } from "../src/lib/constants/color-families";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = buildColorFamilyMapRows();
  console.log(`Seeding color_family_map with ${rows.length} rows…`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE color_family_map`);
    for (const r of rows) {
      await tx.$executeRawUnsafe(
        `INSERT INTO color_family_map (category, value_norm, family, hue_group) VALUES ($1, $2, $3, $4)`,
        r.category,
        r.value_norm,
        r.family,
        r.hue_group,
      );
    }
  });

  console.log("Refreshing mv_person_current_state…");
  await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW mv_person_current_state`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
