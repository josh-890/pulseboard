/**
 * Wipe production/distribution content while keeping seed-person-1 (Jane)
 * and her reference session. Useful for resetting to a clean state.
 *
 * Usage:
 *   npx tsx scripts/cleanup-production-data.ts          # clean dev DB
 *   PROD=1 npx tsx scripts/cleanup-production-data.ts   # clean production DB
 */
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as readline from "readline";

config({ path: process.env.PROD === "1" ? ".env.production" : ".env" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const KEEP_PERSON_ID = "seed-person-1";
const KEEP_SESSION_ID = "seed-session-ref";

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

async function printSummary() {
  console.log("\n=== CLEANUP SUMMARY ===\n");
  console.log(`Keeping: Person "${KEEP_PERSON_ID}" + Reference Session "${KEEP_SESSION_ID}"\n`);

  const counts = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SetMediaItem"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SetParticipant"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SetSession"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SessionParticipant" WHERE "sessionId" != ${KEEP_SESSION_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SetLabelEvidence"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SetCreditRaw" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Set" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Session" WHERE "deletedAt" IS NULL AND id != ${KEEP_SESSION_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "MediaItem" WHERE "deletedAt" IS NULL AND "sessionId" != ${KEEP_SESSION_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Photo" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Activity" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "RelationshipEvent" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonRelationship" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonAlias" WHERE "deletedAt" IS NULL AND "personId" != ${KEEP_PERSON_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Person" WHERE "deletedAt" IS NULL AND id != ${KEEP_PERSON_ID}`,
  ]);

  const labels = [
    "SetMediaItem (hard-delete)",
    "SetParticipant (hard-delete)",
    "SetSession (hard-delete)",
    "SessionParticipant (hard-delete, excl. reference)",
    "SetLabelEvidence (hard-delete)",
    "SetCreditRaw (soft-delete)",
    "Set (soft-delete)",
    "Session (soft-delete, excl. reference)",
    "MediaItem (soft-delete, excl. reference)",
    "Photo (soft-delete)",
    "Activity (soft-delete)",
    "RelationshipEvent (soft-delete)",
    "PersonRelationship (soft-delete)",
    "PersonAlias (soft-delete, excl. Jane)",
    "Person (soft-delete, excl. Jane)",
  ];

  for (let i = 0; i < labels.length; i++) {
    const count = Number(counts[i][0].count);
    console.log(`  ${labels[i]}: ${count} row(s)`);
  }

  console.log("\nPersonMediaLink will be soft-deleted where mediaItemId points to deleted media.\n");
}

async function executeCleanup() {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. Hard-delete junction tables (no deletedAt)
    console.log("1. Hard-deleting junction tables...");

    const r1 = await tx.$executeRaw`DELETE FROM "SetMediaItem"`;
    console.log(`   SetMediaItem: ${r1} row(s)`);

    const r2 = await tx.$executeRaw`DELETE FROM "SetParticipant"`;
    console.log(`   SetParticipant: ${r2} row(s)`);

    const r3 = await tx.$executeRaw`DELETE FROM "SetSession"`;
    console.log(`   SetSession: ${r3} row(s)`);

    const r4 = await tx.$executeRaw`DELETE FROM "SessionParticipant" WHERE "sessionId" != ${KEEP_SESSION_ID}`;
    console.log(`   SessionParticipant: ${r4} row(s)`);

    const r5 = await tx.$executeRaw`DELETE FROM "SetLabelEvidence"`;
    console.log(`   SetLabelEvidence: ${r5} row(s)`);

    // 2. Soft-delete production content
    console.log("\n2. Soft-deleting production content...");

    const r6 = await tx.$executeRaw`UPDATE "SetCreditRaw" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL`;
    console.log(`   SetCreditRaw: ${r6} row(s)`);

    // Clear coverMediaItemId before soft-deleting sets (FK reference)
    await tx.$executeRaw`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE "coverMediaItemId" IS NOT NULL AND "deletedAt" IS NULL`;

    const r7 = await tx.$executeRaw`UPDATE "Set" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL`;
    console.log(`   Set: ${r7} row(s)`);

    const r8 = await tx.$executeRaw`UPDATE "Session" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL AND id != ${KEEP_SESSION_ID}`;
    console.log(`   Session: ${r8} row(s)`);

    const r9 = await tx.$executeRaw`UPDATE "MediaItem" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL AND "sessionId" != ${KEEP_SESSION_ID}`;
    console.log(`   MediaItem: ${r9} row(s)`);

    // Soft-delete PersonMediaLink where mediaItem was just deleted
    const r9b = await tx.$executeRaw`
      UPDATE "PersonMediaLink" SET "deletedAt" = ${now}
      WHERE "deletedAt" IS NULL
        AND "mediaItemId" IN (SELECT id FROM "MediaItem" WHERE "deletedAt" = ${now})
    `;
    console.log(`   PersonMediaLink (orphaned): ${r9b} row(s)`);

    const r10 = await tx.$executeRaw`UPDATE "Photo" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL`;
    console.log(`   Photo: ${r10} row(s)`);

    const r11 = await tx.$executeRaw`UPDATE "Activity" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL`;
    console.log(`   Activity: ${r11} row(s)`);

    // 3. Soft-delete non-Jane persons + their data
    console.log("\n3. Soft-deleting non-Jane persons and relationships...");

    const r12 = await tx.$executeRaw`UPDATE "RelationshipEvent" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL`;
    console.log(`   RelationshipEvent: ${r12} row(s)`);

    const r13 = await tx.$executeRaw`UPDATE "PersonRelationship" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL`;
    console.log(`   PersonRelationship: ${r13} row(s)`);

    const r14 = await tx.$executeRaw`UPDATE "PersonAlias" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL AND "personId" != ${KEEP_PERSON_ID}`;
    console.log(`   PersonAlias: ${r14} row(s)`);

    const r15 = await tx.$executeRaw`UPDATE "Person" SET "deletedAt" = ${now} WHERE "deletedAt" IS NULL AND id != ${KEEP_PERSON_ID}`;
    console.log(`   Person: ${r15} row(s)`);
  });

  // 4. Refresh materialized views
  console.log("\n4. Refreshing materialized views...");
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW mv_dashboard_stats`;
  console.log("   mv_dashboard_stats refreshed");
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW mv_person_current_state`;
  console.log("   mv_person_current_state refreshed");
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW mv_person_affiliations`;
  console.log("   mv_person_affiliations refreshed");

  // 5. Verification
  console.log("\n=== VERIFICATION ===\n");
  const verification = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Person" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonAlias" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Session" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "MediaItem" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonMediaLink" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Set" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Activity" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Photo" WHERE "deletedAt" IS NULL`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonRelationship" WHERE "deletedAt" IS NULL`,
  ]);

  const vLabels = [
    "Person (active)",
    "PersonAlias (active)",
    "Session (active)",
    "MediaItem (active)",
    "PersonMediaLink (active)",
    "Set (active)",
    "Activity (active)",
    "Photo (active)",
    "PersonRelationship (active)",
  ];

  for (let i = 0; i < vLabels.length; i++) {
    console.log(`  ${vLabels[i]}: ${Number(verification[i][0].count)}`);
  }

  console.log("\nCleanup complete!");
}

async function main() {
  await printSummary();

  const proceed = await confirm("Proceed with cleanup?");
  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  await executeCleanup();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
