/**
 * One-off remediation: Pinky June's breast-size enlargement (B → D) was recorded
 * with cause=NATURAL (the dead "Breast Status" dropdown was used instead of the
 * "Cause" picker). Status is derived from cause, so it rendered as plain "D".
 * Flip that single delta's cause NATURAL → SURGICAL on xpulse, then recompute her
 * PersonCurrentState cache so the "B (Natural) → D (Enhanced)" progression shows.
 *
 * Run on the xpulse (prod) DB:
 *   TENANT_XPULSE_DATABASE_URL is read from .env.production.
 *   ! npx tsx --env-file=.env.production scripts/fix-pinky-june-cause.ts
 * (or export the URL into XURL and run with tsx)
 *
 * Safe to delete after running.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.XURL ?? process.env.TENANT_XPULSE_DATABASE_URL;
if (!connectionString) {
  throw new Error("Set XURL or TENANT_XPULSE_DATABASE_URL (load .env.production).");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const pid = "cmqibi1op08wm01lx24c0jkjy"; // Pinky June

  const rows = await prisma.scalarDelta.findMany({
    where: {
      attributeDefinitionId: "cattr-breast-size",
      cause: "NATURAL",
      era: { personId: pid, isBaseline: false },
    },
    select: { id: true, value: true, era: { select: { label: true } } },
  });
  console.log("Matched candidate rows:", JSON.stringify(rows, null, 2));
  if (rows.length !== 1) {
    throw new Error(`Expected exactly 1 candidate row, found ${rows.length}; aborting.`);
  }

  const updated = await prisma.scalarDelta.update({
    where: { id: rows[0].id },
    data: { cause: "SURGICAL" },
    select: { id: true, value: true, cause: true },
  });
  console.log("Updated:", JSON.stringify(updated));

  await prisma.$executeRaw`SELECT app_recompute_person_current_state(${pid})`;
  console.log("Recomputed PersonCurrentState for Pinky June. Done.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
