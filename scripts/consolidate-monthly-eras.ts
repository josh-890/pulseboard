/**
 * Post-deploy cleanup: merge monthly eras into year-level buckets.
 *
 * 1. Find non-baseline eras with MONTH or DAY precision
 * 2. Find/create the YEAR era for the same year + person
 * 3. Reassign all events from monthly → yearly era
 * 4. Delete empty monthly eras
 *
 * Usage: npx tsx scripts/consolidate-monthly-eras.ts [--dry-run]
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(dryRun ? "[DRY RUN] No changes will be made.\n" : "");

  // Find non-baseline eras with MONTH or DAY precision
  const monthlyEras = await prisma.era.findMany({
    where: {
      isBaseline: false,
      datePrecision: { in: ["MONTH", "DAY"] },
      date: { not: null },
    },
    orderBy: [{ personId: "asc" }, { date: "asc" }],
  });

  console.log(`Found ${monthlyEras.length} monthly/daily eras to consolidate.\n`);
  if (monthlyEras.length === 0) return;

  let merged = 0;
  let deleted = 0;

  for (const era of monthlyEras) {
    const year = era.date!.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

    // Find existing YEAR era for same person+year
    let yearEra = await prisma.era.findFirst({
      where: {
        personId: era.personId,
        isBaseline: false,
        id: { not: era.id },
        datePrecision: "YEAR",
        date: { gte: startOfYear, lt: startOfNextYear },
      },
    });

    // Create if not found
    if (!yearEra && !dryRun) {
      yearEra = await prisma.era.create({
        data: {
          personId: era.personId,
          label: `${year}`,
          date: startOfYear,
          datePrecision: "YEAR",
          isBaseline: false,
        },
      });
      console.log(`  Created year era "${year}" for person ${era.personId}`);
    }

    const targetId = yearEra?.id ?? `[would-create-${year}]`;
    console.log(`  ${era.label} (${era.id}) → ${year} (${targetId})`);

    if (!dryRun && yearEra) {
      // Move all events to the year era
      await prisma.$transaction([
        prisma.bodyMarkEvent.updateMany({
          where: { eraId: era.id },
          data: { eraId: yearEra.id },
        }),
        prisma.bodyModificationEvent.updateMany({
          where: { eraId: era.id },
          data: { eraId: yearEra.id },
        }),
        prisma.cosmeticProcedureEvent.updateMany({
          where: { eraId: era.id },
          data: { eraId: yearEra.id },
        }),
        prisma.personSkillEvent.updateMany({
          where: { eraId: era.id },
          data: { eraId: yearEra.id },
        }),
      ]);

      // Move PersonaPhysical if exists (merge into year era)
      const physical = await prisma.personaPhysical.findUnique({
        where: { eraId: era.id },
        include: { attributes: true },
      });
      if (physical) {
        // Check if year era already has a physical record
        const yearPhysical = await prisma.personaPhysical.findUnique({
          where: { eraId: yearEra.id },
        });
        if (yearPhysical) {
          // Merge: later date wins (the monthly era is more precise)
          await prisma.personaPhysicalAttribute.deleteMany({
            where: { personaPhysicalId: physical.id },
          });
          await prisma.personaPhysical.delete({ where: { id: physical.id } });
        } else {
          await prisma.personaPhysical.update({
            where: { id: physical.id },
            data: { eraId: yearEra.id },
          });
        }
      }

      // Move digital identities
      await prisma.personDigitalIdentity.updateMany({
        where: { eraId: era.id },
        data: { eraId: yearEra.id },
      });

      // Move media links
      await prisma.personMediaLink.updateMany({
        where: { eraId: era.id },
        data: { eraId: yearEra.id },
      });

      // Delete the now-empty monthly era
      await prisma.era.delete({ where: { id: era.id } });
      deleted++;
    }

    merged++;
  }

  console.log(`\nDone. Merged ${merged} eras, deleted ${deleted} empty ones.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
