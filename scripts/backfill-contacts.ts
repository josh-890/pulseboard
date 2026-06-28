import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeForSearch } from "../src/lib/normalize";

// Backfill the Contacts register (Contact) + ClaimedCollaboration from the
// raw mentions that already exist in the DB:
//   1. ImportItem CO_MODEL  → Contact (if unmatched) + ClaimedCollaboration
//      from the batch's subject Person.
//   2. StagingSet participants not resolved to a Person → Contact only
//      (staged co-occurrence is computed, not stored as claims).
// Idempotent: refs upsert by icgId, claims upsert by their unique pair.

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type CoModelData = { name?: string; icgId?: string; thumbUrl?: string | null };
type ParticipantStatus = { name?: string; icgId?: string; status?: string; personId?: string };

async function upsertRef(icgId: string, name: string, thumbUrl: string | null) {
  return prisma.contact.upsert({
    where: { icgId },
    create: { icgId, name, nameNorm: normalizeForSearch(name), thumbUrl, source: "import" },
    update: { name, nameNorm: normalizeForSearch(name), thumbUrl: thumbUrl ?? undefined },
  });
}

async function main() {
  let refs = 0;
  let claims = 0;

  // ── 1. Co-models from import batches ──────────────────────────────────────
  const coModels = await prisma.importItem.findMany({
    where: { type: "CO_MODEL" },
    select: { batchId: true, data: true, editedData: true, matchedEntityId: true },
  });

  // Resolve each batch's subject Person once.
  const batchIds = [...new Set(coModels.map((c) => c.batchId))];
  const subjectByBatch = new Map<string, string | null>();
  for (const batchId of batchIds) {
    const personItem = await prisma.importItem.findFirst({
      where: { batchId, type: "PERSON" },
      select: { matchedEntityId: true },
    });
    subjectByBatch.set(batchId, personItem?.matchedEntityId ?? null);
  }

  for (const cm of coModels) {
    const subjectPersonId = subjectByBatch.get(cm.batchId) ?? null;
    if (!subjectPersonId) continue; // subject not yet curated — no claim anchor
    const d = ((cm.editedData ?? cm.data) ?? {}) as CoModelData;
    const icgId = d.icgId || null;
    const name = d.name || icgId || "Unknown";
    const thumbUrl = d.thumbUrl ?? null;
    const counterpartPersonId = cm.matchedEntityId ?? null;

    if (counterpartPersonId) {
      if (counterpartPersonId === subjectPersonId) continue; // self
      const r = await prisma.claimedCollaboration.upsert({
        where: { subjectPersonId_counterpartPersonId: { subjectPersonId, counterpartPersonId } },
        create: { subjectPersonId, counterpartPersonId, sourceLabel: "import" },
        update: {},
      });
      if (r) claims++;
    } else if (icgId) {
      const ref = await upsertRef(icgId, name, thumbUrl);
      refs++;
      await prisma.claimedCollaboration.upsert({
        where: { subjectPersonId_counterpartRefId: { subjectPersonId, counterpartRefId: ref.id } },
        create: { subjectPersonId, counterpartRefId: ref.id, sourceLabel: "import" },
        update: {},
      });
      claims++;
    }
  }

  // ── 2. Staged-set participants not resolved to a Person ───────────────────
  const stagingSets = await prisma.stagingSet.findMany({
    select: { participantStatuses: true },
  });
  for (const ss of stagingSets) {
    const parts = ss.participantStatuses as ParticipantStatus[] | null;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (p.personId) continue; // already a curated Person
      if (!p.icgId) continue; // nothing addressable
      await upsertRef(p.icgId, p.name || p.icgId, null);
      refs++;
    }
  }

  const refCount = await prisma.contact.count();
  const claimCount = await prisma.claimedCollaboration.count();
  console.log(`Processed ${coModels.length} co-models, ${stagingSets.length} staged sets.`);
  console.log(`Upserts: refs touched ${refs}, claims touched ${claims}.`);
  console.log(`Totals now: Contact ${refCount}, ClaimedCollaboration ${claimCount}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
