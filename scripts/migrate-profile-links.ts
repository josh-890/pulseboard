/**
 * ADR-0016 slice 6c — idempotent per-tenant backfill of Profile representatives.
 *
 * For each HEADSHOT slot link, create a DETAIL link to that slot's Profile category
 * (cat_profile_slot{N}) with isRepresentative=true (one image per slot = its rep).
 * Baked slot images (motifTemplateId set) are reclassified annotation→aligned.
 * The HEADSHOT/isAvatar links are LEFT IN PLACE for the dual-read fallback (6d);
 * they're dropped in 6e. The avatar is then derived as the Headshot category's
 * representative (slot 1); people with no slot-1 image fall back to the old avatar.
 *
 * Run after the seed, per tenant:
 *   DATABASE_URL="$TENANT_PULSE_DATABASE_URL" npx tsx scripts/migrate-profile-links.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const profileCats = await p.mediaCategory.findMany({ where: { id: { startsWith: "cat_profile_slot" } }, select: { id: true } });
  const catIds = new Set(profileCats.map((c) => c.id));
  if (catIds.size === 0) { console.log("NO Profile categories — run the seed first."); await p.$disconnect(); return; }

  const headshotLinks = await p.personMediaLink.findMany({
    where: { usage: "HEADSHOT", slot: { not: null } },
    select: { personId: true, mediaItemId: true, slot: true, mediaItem: { select: { motifTemplateId: true } } },
  });

  let created = 0, skipped = 0, reclassified = 0;
  for (const l of headshotLinks) {
    const catId = `cat_profile_slot${l.slot}`;
    if (!catIds.has(catId)) { skipped++; continue; }

    // Don't clobber an existing DETAIL link for this person+media.
    const existing = await p.personMediaLink.findFirst({ where: { personId: l.personId, mediaItemId: l.mediaItemId, usage: "DETAIL" }, select: { id: true } });
    if (existing) { skipped++; continue; }

    await p.personMediaLink.create({ data: { personId: l.personId, mediaItemId: l.mediaItemId, usage: "DETAIL", categoryId: catId, isRepresentative: true } });
    created++;

    // Reclassify baked headshots: aligned image identity is motifTemplateId, not isAnnotation (ADR-0013).
    if (l.mediaItem.motifTemplateId) {
      const r = await p.mediaItem.updateMany({ where: { id: l.mediaItemId, isAnnotation: true }, data: { isAnnotation: false } });
      reclassified += r.count;
    }
  }

  console.log(`MIGRATED created=${created} skipped=${skipped} reclassified=${reclassified} (of ${headshotLinks.length} HEADSHOT links)`);
  await p.$disconnect();
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
