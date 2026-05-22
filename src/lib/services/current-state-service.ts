import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Recompute one person's cached current state (`PersonCurrentState`).
 *
 * MUST be called inside the same `$transaction` as any mutation that changes a
 * fold input (physical changes, body marks/modifications/procedures, eyeColor).
 * This keeps the cache drift-free by construction — see ADR-0003.
 *
 * Phase B: delegates to the SQL function `app_recompute_person_current_state`,
 * a verbatim port of the old `mv_person_current_state` fold.
 */
export async function recomputePersonCurrentState(
  tx: TxClient,
  personId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT app_recompute_person_current_state(${personId})`;
}

/**
 * Recompute one person's cached current state as a standalone statement.
 * For call sites not already inside a transaction — e.g. delete actions that
 * delegate to service functions owning their own transaction. The recompute is
 * a single idempotent statement issued in the same server-action request.
 */
export async function recomputePersonCurrentStateStandalone(personId: string): Promise<void> {
  await prisma.$executeRaw`SELECT app_recompute_person_current_state(${personId})`;
}

/**
 * Rebuild the entire `PersonCurrentState` cache (every person).
 * Use after bulk operations, after a colour-catalog change (classification
 * columns shift), post-deploy, and from the manual Settings button.
 */
export async function rebuildAllCurrentState(): Promise<number> {
  await prisma.$executeRaw`SELECT app_recompute_person_current_state()`;
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM "PersonCurrentState"`;
  return Number(rows[0]?.count ?? 0);
}

// Row fingerprint excluding `updatedAt` (which the recompute always bumps).
const HASH_SQL = `SELECT "personId", md5((to_jsonb(pcs.*) - 'updatedAt')::text) AS h FROM "PersonCurrentState" pcs`;

/**
 * Integrity check (ADR-0003): recompute every row and report which ones had
 * drifted from their correct value. A non-empty result means a write path
 * mutated a fold input without calling `recomputePersonCurrentState` — a bug.
 * The check is self-healing: drifted rows are corrected as a side effect.
 */
export async function verifyCurrentStateIntegrity(): Promise<{
  checked: number;
  mismatches: string[];
}> {
  const before = await prisma.$queryRawUnsafe<{ personId: string; h: string }[]>(HASH_SQL);
  await prisma.$executeRaw`SELECT app_recompute_person_current_state()`;
  const after = await prisma.$queryRawUnsafe<{ personId: string; h: string }[]>(HASH_SQL);

  const beforeByPerson = new Map(before.map((r) => [r.personId, r.h]));
  const mismatches: string[] = [];
  for (const row of after) {
    if (beforeByPerson.get(row.personId) !== row.h) mismatches.push(row.personId);
  }
  return { checked: after.length, mismatches };
}
