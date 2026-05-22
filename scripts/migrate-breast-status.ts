/**
 * Phase C1 data migration — breast STATUS → CosmeticProcedure.
 *
 * `PersonaPhysical.breastStatus = 'enhanced'` is not a stored attribute: the
 * "Enhanced" status is *derived* from the presence of a CosmeticProcedure
 * targeting breast_size (ADR / migration plan §4.2). This script converts each
 * enhanced row into a breast-augmentation CosmeticProcedure + an undated
 * `performed` event in an "Imported — undated changes" draft Era.
 *
 * `breastStatus = 'natural'` / null → nothing (Natural is the default).
 *
 * Idempotent — skips any person who already has a breast_size procedure.
 *
 * Usage:
 *   npx tsx scripts/migrate-breast-status.ts          # uses .env (dev)
 *   DATABASE_URL=... npx tsx scripts/migrate-breast-status.ts   # a tenant
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BREAST_SIZE_DEF_ID = "cattr-breast-size";
const DRAFT_ERA_LABEL = "Imported — undated changes";

async function main() {
  const enhanced = await prisma.personaPhysical.findMany({
    where: { breastStatus: "enhanced" },
    select: {
      breastSize: true,
      breastDescription: true,
      era: { select: { personId: true } },
    },
  });

  console.log(`Found ${enhanced.length} enhanced PersonaPhysical row(s).`);
  if (enhanced.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // One procedure per person (the enhancement), not per era.
  const byPerson = new Map<string, { breastSize: string | null; breastDescription: string | null }>();
  for (const pp of enhanced) {
    const personId = pp.era.personId;
    if (!byPerson.has(personId)) {
      byPerson.set(personId, { breastSize: pp.breastSize, breastDescription: pp.breastDescription });
    }
  }

  let created = 0;
  let skipped = 0;

  for (const [personId, { breastSize, breastDescription }] of byPerson) {
    // Idempotency: skip if this person already has a breast_size procedure.
    const existing = await prisma.cosmeticProcedure.findFirst({
      where: { personId, attributeDefinitionId: BREAST_SIZE_DEF_ID },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // Find or create the person's "Imported — undated changes" draft Era.
      let draftEra = await tx.era.findFirst({
        where: { personId, label: DRAFT_ERA_LABEL, isDraft: true },
      });
      draftEra ??= await tx.era.create({
        data: { personId, label: DRAFT_ERA_LABEL, isDraft: true, isBaseline: false },
      });

      const procedure = await tx.cosmeticProcedure.create({
        data: {
          personId,
          type: "breast augmentation",
          bodyRegion: "chest",
          bodyRegions: ["chest"],
          description: breastDescription ?? null,
          status: "completed",
          attributeDefinitionId: BREAST_SIZE_DEF_ID,
        },
      });

      await tx.cosmeticProcedureEvent.create({
        data: {
          cosmeticProcedureId: procedure.id,
          eraId: draftEra.id,
          eventType: "performed",
          datePrecision: "UNKNOWN",
          valueAfter: breastSize ?? null,
          notes: breastDescription ? `import: "${breastDescription}"` : null,
        },
      });
    });
    created++;
  }

  console.log(`Done. Created ${created} procedure(s); skipped ${skipped} already-migrated person(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
