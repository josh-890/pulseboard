/**
 * Backfill participantStatuses on existing StagingSet rows.
 *
 * For each participant:
 * - "known"     → Person exists with matching icgId
 * - "candidate" → No Person by icgId, but a PersonAlias nameNorm matches
 * - "new"       → Neither icgId nor alias match
 *
 * Safe to re-run (overwrites existing statuses).
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function normalizeForSearch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function main() {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  // 1. Fetch all staging sets with participants
  const sets = await prisma.stagingSet.findMany({
    where: { participants: { not: Prisma.JsonNullValueFilter.DbNull } },
    select: { id: true, participants: true },
  });
  console.log(`Found ${sets.length} staging sets with participants`);

  // 2. Collect all unique icgIds and names
  const allIcgIds = new Set<string>();
  const allNames = new Set<string>();
  for (const s of sets) {
    const participants = s.participants as Array<{ name: string; icgId: string }>;
    for (const p of participants) {
      allIcgIds.add(p.icgId);
      allNames.add(normalizeForSearch(p.name));
    }
  }

  // 3. Batch lookup: which icgIds exist as Person records?
  const knownPersons = await prisma.person.findMany({
    where: { icgId: { in: Array.from(allIcgIds) } },
    select: { id: true, icgId: true },
  });
  const personByIcgId = new Map(knownPersons.map((p) => [p.icgId, p.id]));
  console.log(`${personByIcgId.size} known persons (by icgId)`);

  // 4. Batch lookup: which normalized names exist as PersonAlias?
  const candidateAliases = await prisma.personAlias.findMany({
    where: { nameNorm: { in: Array.from(allNames) } },
    select: { nameNorm: true },
  });
  const candidateNameNorms = new Set(candidateAliases.map((a) => a.nameNorm));
  console.log(`${candidateNameNorms.size} candidate alias matches`);

  // 5. Compute and update each staging set
  let updated = 0;
  for (const s of sets) {
    const participants = s.participants as Array<{ name: string; icgId: string }>;
    const statuses = participants.map((p) => {
      const personId = personByIcgId.get(p.icgId);
      if (personId) {
        return { name: p.name, icgId: p.icgId, status: "known" as const, personId };
      }
      const nameNorm = normalizeForSearch(p.name);
      if (candidateNameNorms.has(nameNorm)) {
        return { name: p.name, icgId: p.icgId, status: "candidate" as const };
      }
      return { name: p.name, icgId: p.icgId, status: "new" as const };
    });

    await prisma.stagingSet.update({
      where: { id: s.id },
      data: { participantStatuses: statuses },
    });
    updated++;
  }

  console.log(`Updated ${updated} staging sets`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
