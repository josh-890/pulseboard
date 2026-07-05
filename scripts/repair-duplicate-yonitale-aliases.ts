/**
 * Repair duplicate PersonAlias rows created by the pre-fix "Other name…" credit
 * flow (createAlias used to always-create instead of find-or-reuse). On xpulse
 * set BLE (Channel "Yonitale") two aliases were duplicated:
 *   - Lilit A   (LA-00FZ) → "Ariel"        already existed on other channels
 *   - Katya Clover (CX-00L3) → "Katya Clover" already existed on other channels
 *
 * For each person we find the duplicate group by (personId, nameNorm):
 *   canonical = alias linked to a NON-Yonitale channel (the pre-existing one)
 *   duplicate = alias linked ONLY to Yonitale (the row the bug minted)
 * and merge duplicate → canonical via the corrected mergeAliases (which now
 * re-points SetCreditRaw/SessionContribution pins before deleting the source).
 * Finally we ensure the canonical's Yonitale link is primary if it's the
 * person's only alias on that channel.
 *
 * Usage (audit / dry-run — READ ONLY):
 *   npx dotenv-cli -e .env.production -- npx tsx scripts/repair-duplicate-yonitale-aliases.ts
 * Apply (DESTRUCTIVE — back up xpulse first):
 *   npx dotenv-cli -e .env.production -- npx tsx scripts/repair-duplicate-yonitale-aliases.ts --apply
 */

import "dotenv/config";
import { runWithTenant } from "../src/lib/tenant-context";
import { prisma } from "../src/lib/db";
import { mergeAliases } from "../src/lib/services/alias-service";

const APPLY = process.argv.includes("--apply");
const TENANT = "xpulse";
const CHANNEL_NAME = "Yonitale";

const TARGETS: { icgId: string; name: string }[] = [
  { icgId: "LA-00FZ", name: "Ariel" },
  { icgId: "CX-00L3", name: "Katya Clover" },
];

async function main() {
  const channel = await prisma.channel.findFirst({ where: { name: CHANNEL_NAME }, select: { id: true, name: true } });
  if (!channel) throw new Error(`Channel "${CHANNEL_NAME}" not found on ${TENANT}`);
  console.log(`Channel "${channel.name}" = ${channel.id}\n`);

  for (const target of TARGETS) {
    const person = await prisma.person.findFirst({ where: { icgId: target.icgId }, select: { id: true, icgId: true } });
    if (!person) {
      console.log(`⚠️  Person ${target.icgId} not found — skipping`);
      continue;
    }

    const aliases = await prisma.personAlias.findMany({
      where: { personId: person.id, name: { equals: target.name, mode: "insensitive" } },
      include: {
        channelLinks: { include: { channel: { select: { id: true, name: true } } } },
        _count: { select: { creditUsages: true, sessionUsages: true } },
      },
    });

    console.log(`── ${target.icgId} · "${target.name}" — ${aliases.length} alias row(s)`);
    for (const a of aliases) {
      const chans = a.channelLinks.map((l) => `${l.channel.name}${l.isPrimary ? "*" : ""}`).join(", ") || "(none)";
      console.log(`   ${a.id}  common=${a.isCommon} source=${a.source}  credits=${a._count.creditUsages} sessions=${a._count.sessionUsages}  channels=[${chans}]`);
    }

    if (aliases.length < 2) {
      console.log(`   ✓ no duplicate to repair\n`);
      continue;
    }

    const canonical = aliases.find((a) => a.channelLinks.some((l) => l.channel.id !== channel.id));
    const duplicates = aliases.filter(
      (a) => a.id !== canonical?.id && a.channelLinks.every((l) => l.channel.id === channel.id),
    );

    if (!canonical || duplicates.length === 0) {
      console.log(`   ⚠️  could not classify canonical vs duplicate automatically — MANUAL review needed\n`);
      continue;
    }
    console.log(`   → canonical=${canonical.id}   merge in duplicate(s)=[${duplicates.map((d) => d.id).join(", ")}]`);

    if (!APPLY) {
      console.log(`   (dry-run — pass --apply to execute)\n`);
      continue;
    }

    await mergeAliases(canonical.id, duplicates.map((d) => d.id));

    // Ensure the Yonitale link is primary when canonical is the sole alias there.
    const othersOnChannel = await prisma.personAliasChannel.count({
      where: { channelId: channel.id, alias: { personId: person.id }, NOT: { aliasId: canonical.id } },
    });
    await prisma.personAliasChannel.update({
      where: { aliasId_channelId: { aliasId: canonical.id, channelId: channel.id } },
      data: { isPrimary: othersOnChannel === 0 },
    });
    console.log(`   ✅ merged; canonical Yonitale link primary=${othersOnChannel === 0}\n`);
  }
}

runWithTenant(TENANT, main)
  .then(() => console.log("Done."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
