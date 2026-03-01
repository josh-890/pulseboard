/**
 * Delete orphaned PersonMediaLink records where usage = 'HEADSHOT' AND slot IS NULL.
 * These are meaningless after the UX simplification that makes slot assignment direct.
 *
 * Usage:
 *   npx tsx scripts/cleanup-slotless-headshots.ts          # clean dev DB
 *   PROD=1 npx tsx scripts/cleanup-slotless-headshots.ts   # clean production DB
 */
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as readline from "readline";

config({ path: process.env.PROD === "1" ? ".env.production" : ".env" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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

async function main() {
  const dbLabel = process.env.PROD === "1" ? "PRODUCTION" : "dev";
  console.log(`\n=== Cleanup Slotless Headshots (${dbLabel}) ===\n`);

  const rows = await prisma.$queryRaw<{ id: string; personId: string; mediaItemId: string }[]>`
    SELECT id, "personId", "mediaItemId"
    FROM "PersonMediaLink"
    WHERE usage = 'HEADSHOT' AND slot IS NULL AND "deletedAt" IS NULL
  `;

  if (rows.length === 0) {
    console.log("No slotless HEADSHOT links found. Nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} slotless HEADSHOT link(s):\n`);
  for (const row of rows) {
    console.log(`  id=${row.id}  person=${row.personId}  media=${row.mediaItemId}`);
  }

  const proceed = await confirm(`\nSoft-delete ${rows.length} record(s)?`);
  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  const now = new Date();
  const count = await prisma.$executeRaw`
    UPDATE "PersonMediaLink"
    SET "deletedAt" = ${now}
    WHERE usage = 'HEADSHOT' AND slot IS NULL AND "deletedAt" IS NULL
  `;

  console.log(`\nSoft-deleted ${count} slotless HEADSHOT link(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
