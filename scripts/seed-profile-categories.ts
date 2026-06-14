/**
 * ADR-0016 slice 6a — idempotent per-tenant seed of the Profile category group.
 *
 * Creates a "Profile" MediaCategoryGroup with one category per used profile slot,
 * named from that tenant's slot labels (Setting `p-img0{n}-label`). Slot 1 →
 * Headshot, the undeletable avatar source. Binds each slot's MotifTemplate to its
 * category. Does NOT touch PersonMediaLinks or the hero (that's slices 6c/6d).
 *
 * Run per tenant with the tenant DATABASE_URL, e.g.:
 *   DATABASE_URL="$TENANT_PULSE_DATABASE_URL" npx tsx scripts/seed-profile-categories.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const GROUP_ID = "grp_profile";

async function main() {
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  // Slots in use: 1 (always), plus any slot with a template or existing HEADSHOT image.
  const templates = await p.motifTemplate.findMany({ where: { slot: { not: null } }, select: { id: true, slot: true } });
  const linkSlots = await p.personMediaLink.findMany({
    where: { usage: "HEADSHOT", slot: { not: null } },
    select: { slot: true },
    distinct: ["slot"],
  });
  const used = new Set<number>([1]);
  for (const t of templates) if (t.slot != null) used.add(t.slot);
  for (const l of linkSlots) if (l.slot != null) used.add(l.slot);
  const slots = [...used].sort((a, b) => a - b);

  // Labels from Settings.
  const labelKeys = slots.map((n) => `p-img0${n}-label`);
  const settings = await p.setting.findMany({ where: { key: { in: labelKeys } }, select: { key: true, value: true } });
  const labelByKey = new Map(settings.map((s) => [s.key, s.value]));
  const labelFor = (n: number) => labelByKey.get(`p-img0${n}-label`)?.trim() || (n === 1 ? "Headshot" : `Photo ${n}`);

  const templateBySlot = new Map(templates.flatMap((t) => (t.slot != null ? [[t.slot, t.id] as const] : [])));

  // Group (sortOrder 0 → shows first in the person browser).
  await p.mediaCategoryGroup.upsert({
    where: { id: GROUP_ID },
    update: {},
    create: { id: GROUP_ID, name: "Profile", sortOrder: 0 },
  });

  for (const n of slots) {
    const catId = `cat_profile_slot${n}`;
    const isHead = n === 1;
    await p.mediaCategory.upsert({
      where: { id: catId },
      update: { isAvatarSource: isHead },
      create: {
        id: catId,
        groupId: GROUP_ID,
        name: labelFor(n),
        slug: `profile-slot-${n}`,
        sortOrder: n - 1,
        isAvatarSource: isHead,
      },
    });
    // Bind the slot's template to this category (transitional — slot stays until 6e).
    const tplId = templateBySlot.get(n);
    if (tplId) {
      await p.mediaCategory.updateMany({ where: { alignmentTemplateId: tplId }, data: { alignmentTemplateId: null } });
      await p.mediaCategory.update({ where: { id: catId }, data: { alignmentTemplateId: tplId } });
    }
  }

  const cats = await p.mediaCategory.findMany({ where: { groupId: GROUP_ID }, orderBy: { sortOrder: "asc" }, select: { name: true, isAvatarSource: true, alignmentTemplateId: true } });
  console.log("SEEDED Profile group with categories:", JSON.stringify(cats));
  await p.$disconnect();
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
