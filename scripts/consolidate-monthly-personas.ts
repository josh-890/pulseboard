/**
 * Post-deploy cleanup: merge monthly personas into year-level buckets.
 *
 * 1. Find non-baseline personas with MONTH or DAY precision
 * 2. Find/create the YEAR persona for the same year + person
 * 3. Reassign all events from monthly → yearly persona
 * 4. Delete empty monthly personas
 *
 * Usage: npx tsx scripts/consolidate-monthly-personas.ts [--dry-run]
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(dryRun ? "[DRY RUN] No changes will be made.\n" : "");

  // Find non-baseline personas with MONTH or DAY precision
  const monthlyPersonas = await prisma.persona.findMany({
    where: {
      isBaseline: false,
      datePrecision: { in: ["MONTH", "DAY"] },
      date: { not: null },
    },
    orderBy: [{ personId: "asc" }, { date: "asc" }],
  });

  console.log(`Found ${monthlyPersonas.length} monthly/daily personas to consolidate.\n`);
  if (monthlyPersonas.length === 0) return;

  let merged = 0;
  let deleted = 0;

  for (const persona of monthlyPersonas) {
    const year = persona.date!.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

    // Find existing YEAR persona for same person+year
    let yearPersona = await prisma.persona.findFirst({
      where: {
        personId: persona.personId,
        isBaseline: false,
        id: { not: persona.id },
        datePrecision: "YEAR",
        date: { gte: startOfYear, lt: startOfNextYear },
      },
    });

    // Create if not found
    if (!yearPersona && !dryRun) {
      yearPersona = await prisma.persona.create({
        data: {
          personId: persona.personId,
          label: `${year}`,
          date: startOfYear,
          datePrecision: "YEAR",
          isBaseline: false,
        },
      });
      console.log(`  Created year persona "${year}" for person ${persona.personId}`);
    }

    const targetId = yearPersona?.id ?? `[would-create-${year}]`;
    console.log(`  ${persona.label} (${persona.id}) → ${year} (${targetId})`);

    if (!dryRun && yearPersona) {
      // Move all events to the year persona
      await prisma.$transaction([
        prisma.bodyMarkEvent.updateMany({
          where: { personaId: persona.id },
          data: { personaId: yearPersona.id },
        }),
        prisma.bodyModificationEvent.updateMany({
          where: { personaId: persona.id },
          data: { personaId: yearPersona.id },
        }),
        prisma.cosmeticProcedureEvent.updateMany({
          where: { personaId: persona.id },
          data: { personaId: yearPersona.id },
        }),
        prisma.personSkillEvent.updateMany({
          where: { personaId: persona.id },
          data: { personaId: yearPersona.id },
        }),
      ]);

      // Move PersonaPhysical if exists (merge into year persona)
      const physical = await prisma.personaPhysical.findUnique({
        where: { personaId: persona.id },
        include: { attributes: true },
      });
      if (physical) {
        // Check if year persona already has a physical record
        const yearPhysical = await prisma.personaPhysical.findUnique({
          where: { personaId: yearPersona.id },
        });
        if (yearPhysical) {
          // Merge: later date wins (the monthly persona is more precise)
          await prisma.personaPhysicalAttribute.deleteMany({
            where: { personaPhysicalId: physical.id },
          });
          await prisma.personaPhysical.delete({ where: { id: physical.id } });
        } else {
          await prisma.personaPhysical.update({
            where: { id: physical.id },
            data: { personaId: yearPersona.id },
          });
        }
      }

      // Move digital identities
      await prisma.personDigitalIdentity.updateMany({
        where: { personaId: persona.id },
        data: { personaId: yearPersona.id },
      });

      // Move media links
      await prisma.personMediaLink.updateMany({
        where: { personaId: persona.id },
        data: { personaId: yearPersona.id },
      });

      // Delete the now-empty monthly persona
      await prisma.persona.delete({ where: { id: persona.id } });
      deleted++;
    }

    merged++;
  }

  console.log(`\nDone. Merged ${merged} personas, deleted ${deleted} empty ones.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
