/**
 * Convert Person.nationality to the canonical 3-letter IOC code.
 *
 * Canonical format is now IOC (e.g. "GER", "USA"). This rewrites any value
 * that isn't already a valid IOC code — 2-letter ISO ("DE"), names, etc. —
 * via resolveNationalityToIoc. Values with no mapping are left untouched and
 * reported. Safe to re-run (idempotent). Per tenant: set DATABASE_URL.
 *   npx tsx scripts/migrate-nationality-to-ioc.ts [--dry-run]
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveNationalityToIoc } from "../src/lib/constants/countries";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const persons = await prisma.person.findMany({
    where: { nationality: { not: null } },
    select: { id: true, nationality: true },
  });

  let converted = 0;
  let unmapped = 0;
  for (const p of persons) {
    const cur = p.nationality!;
    const ioc = resolveNationalityToIoc(cur);
    if (ioc === cur) continue; // already canonical IOC
    if (!ioc) {
      unmapped++;
      console.log(`  UNMAPPED ${p.id}: "${cur}" — left as-is`);
      continue;
    }
    converted++;
    if (dryRun) {
      console.log(`  [dry] ${p.id}: ${cur} → ${ioc}`);
    } else {
      await prisma.person.update({ where: { id: p.id }, data: { nationality: ioc } });
    }
  }

  console.log(
    `${dryRun ? "Would convert" : "Converted"} ${converted}; ${unmapped} unmapped; ${persons.length} scanned.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
