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
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "SetCreditRaw"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Set"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Session" WHERE id != ${KEEP_SESSION_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "MediaItem" WHERE "sessionId" != ${KEEP_SESSION_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Activity"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "RelationshipEvent"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonRelationship"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonAlias" WHERE "personId" != ${KEEP_PERSON_ID}`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Person" WHERE id != ${KEEP_PERSON_ID}`,
  ]);

  const labels = [
    "SetMediaItem",
    "SetParticipant",
    "SetSession",
    "SessionParticipant (excl. reference)",
    "SetLabelEvidence",
    "SetCreditRaw",
    "Set",
    "Session (excl. reference)",
    "MediaItem (excl. reference)",
    "Activity",
    "RelationshipEvent",
    "PersonRelationship",
    "PersonAlias (excl. Jane)",
    "Person (excl. Jane)",
  ];

  for (let i = 0; i < labels.length; i++) {
    const count = Number(counts[i][0].count);
    console.log(`  ${labels[i]}: ${count} row(s)`);
  }

  console.log("\nPersonMediaLink will be deleted where mediaItem is deleted.\n");
}

async function executeCleanup() {
  await prisma.$transaction(async (tx) => {
    // 1. Delete junction tables
    console.log("1. Deleting junction tables...");

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

    // 2. Delete production content
    console.log("\n2. Deleting production content...");

    const r6 = await tx.$executeRaw`DELETE FROM "SetCreditRaw"`;
    console.log(`   SetCreditRaw: ${r6} row(s)`);

    // Clear coverMediaItemId before deleting sets (FK reference)
    await tx.$executeRaw`UPDATE "Set" SET "coverMediaItemId" = NULL WHERE "coverMediaItemId" IS NOT NULL`;

    const r7 = await tx.$executeRaw`DELETE FROM "Set"`;
    console.log(`   Set: ${r7} row(s)`);

    // Delete PersonMediaLink before MediaItem (FK)
    const r9b = await tx.$executeRaw`
      DELETE FROM "PersonMediaLink"
      WHERE "mediaItemId" IN (SELECT id FROM "MediaItem" WHERE "sessionId" != ${KEEP_SESSION_ID})
    `;
    console.log(`   PersonMediaLink (for non-reference media): ${r9b} row(s)`);

    // Delete MediaCollectionItem before MediaItem
    const rci = await tx.$executeRaw`
      DELETE FROM "MediaCollectionItem"
      WHERE "mediaItemId" IN (SELECT id FROM "MediaItem" WHERE "sessionId" != ${KEEP_SESSION_ID})
    `;
    console.log(`   MediaCollectionItem: ${rci} row(s)`);

    // Delete SkillEventMedia before MediaItem
    const rse = await tx.$executeRaw`
      DELETE FROM "SkillEventMedia"
      WHERE "mediaItemId" IN (SELECT id FROM "MediaItem" WHERE "sessionId" != ${KEEP_SESSION_ID})
    `;
    console.log(`   SkillEventMedia: ${rse} row(s)`);

    const r8 = await tx.$executeRaw`DELETE FROM "Session" WHERE id != ${KEEP_SESSION_ID}`;
    console.log(`   Session: ${r8} row(s)`);

    const r9 = await tx.$executeRaw`DELETE FROM "MediaItem" WHERE "sessionId" != ${KEEP_SESSION_ID}`;
    console.log(`   MediaItem: ${r9} row(s)`);

    const r11 = await tx.$executeRaw`DELETE FROM "Activity"`;
    console.log(`   Activity: ${r11} row(s)`);

    // 3. Delete non-Jane persons + their data
    console.log("\n3. Deleting non-Jane persons and relationships...");

    const r12 = await tx.$executeRaw`DELETE FROM "RelationshipEvent"`;
    console.log(`   RelationshipEvent: ${r12} row(s)`);

    const r13 = await tx.$executeRaw`DELETE FROM "PersonRelationship"`;
    console.log(`   PersonRelationship: ${r13} row(s)`);

    const r14 = await tx.$executeRaw`DELETE FROM "PersonAlias" WHERE "personId" != ${KEEP_PERSON_ID}`;
    console.log(`   PersonAlias: ${r14} row(s)`);

    const r15 = await tx.$executeRaw`DELETE FROM "Person" WHERE id != ${KEEP_PERSON_ID}`;
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
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Person"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonAlias"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Session"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "MediaItem"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonMediaLink"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Set"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Activity"`,
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "PersonRelationship"`,
  ]);

  const vLabels = [
    "Person",
    "PersonAlias",
    "Session",
    "MediaItem",
    "PersonMediaLink",
    "Set",
    "Activity",
    "PersonRelationship",
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
