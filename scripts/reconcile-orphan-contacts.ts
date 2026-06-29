/**
 * Reconcile orphan Contacts whose ICG-ID already belongs to a curated Person.
 *
 * Such a Contact is stale — e.g. the backfill created it from staged data before
 * that Person was added, so the normal create-time reconcile never fired. This
 * resolves each by ICG-ID (the exact, canonical key): repoints its
 * ClaimedCollaboration + PersonRelationship edges onto the Person and deletes the
 * Contact (same logic importPerson/createPersonRecord use). After this the
 * Contacts register shows only people who really aren't in the DB yet.
 *
 * Read-only by default. Run per tenant:
 *   DATABASE_URL=... npx tsx scripts/reconcile-orphan-contacts.ts          # dry-run
 *   DATABASE_URL=... npx tsx scripts/reconcile-orphan-contacts.ts --apply  # write
 */

import "dotenv/config";
import { prisma } from "@/lib/db";
import { reconcileContacts } from "@/lib/services/relationship-service";

const apply = process.argv.includes("--apply");

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { icgId: { not: null } },
    select: { id: true, icgId: true, name: true },
  });
  const icgs = contacts.map((c) => c.icgId!).filter(Boolean);
  const persons = await prisma.person.findMany({
    where: { icgId: { in: icgs } },
    select: { id: true, icgId: true },
  });
  const personByIcg = new Map(persons.map((p) => [p.icgId, p.id]));
  const orphans = contacts.filter((c) => personByIcg.has(c.icgId!));

  console.log(`Contacts: ${contacts.length} | orphans (icgId already a Person): ${orphans.length}`);
  for (const o of orphans.slice(0, 20)) console.log(`  reconcile  ${o.name} (${o.icgId})`);
  if (orphans.length > 20) console.log(`  …and ${orphans.length - 20} more`);

  if (apply && orphans.length > 0) {
    let done = 0;
    for (const o of orphans) {
      const personId = personByIcg.get(o.icgId!)!;
      await prisma.$transaction((tx) => reconcileContacts(tx, o.icgId!, personId));
      done++;
    }
    const remaining = await prisma.contact.count();
    console.log(`Applied: reconciled ${done} orphan contact(s). Contacts now: ${remaining}.`);
  } else if (!apply) {
    console.log("(dry-run — re-run with --apply to reconcile)");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
