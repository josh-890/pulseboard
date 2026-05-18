import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildColorCatalogRows } from "../src/lib/constants/color-catalog";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = buildColorCatalogRows();
  console.log(`Seeding color_catalog with ${rows.length} rows…`);

  await prisma.$transaction(async (tx) => {
    // Truncate seed rows only — preserve any manual/import_auto entries the
    // admin or import script has added on top.
    await tx.$executeRawUnsafe(`DELETE FROM color_catalog WHERE source = 'seed'`);
    for (const r of rows) {
      await tx.$executeRawUnsafe(
        `INSERT INTO color_catalog
           (category, value_norm, display, hue, shade, shade_rank, sort_order, source, needs_review)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'seed', false)
         ON CONFLICT (category, value_norm) DO UPDATE SET
           display    = EXCLUDED.display,
           hue        = EXCLUDED.hue,
           shade      = EXCLUDED.shade,
           shade_rank = EXCLUDED.shade_rank,
           sort_order = EXCLUDED.sort_order,
           source     = 'seed',
           needs_review = false`,
        r.category,
        r.value_norm,
        r.display,
        r.hue,
        r.shade,
        r.shade_rank,
        r.sort_order,
      );
    }
  });

  const counts = await prisma.$queryRawUnsafe<{ category: string; n: bigint }[]>(
    `SELECT category, count(*)::bigint AS n FROM color_catalog GROUP BY category ORDER BY category`,
  );
  for (const c of counts) console.log(`  ${c.category}: ${c.n}`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
