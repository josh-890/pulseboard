/**
 * ADR-0020 Phase 1 invariant check.
 *
 * Asserts, for every Channel, that the new owning-label FK matches the shared
 * resolution rule over its ChannelLabelMap rows:
 *
 *     Channel.labelId === pickOwnerLabelId(channel's maps)
 *
 * Run after the backfill migration, on EACH tenant DB (point DATABASE_URL at it):
 *
 *     DATABASE_URL=... npx tsx scripts/check-channel-owner-invariant.ts
 *
 * Exits non-zero if any channel violates the invariant. Read-only.
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { pickOwnerLabelId } from '../src/lib/services/label-resolution'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const channels = await prisma.channel.findMany({ select: { id: true, name: true, labelId: true } })
  const maps = await prisma.channelLabelMap.findMany({ select: { channelId: true, labelId: true, confidence: true } })

  const byChannel = new Map<string, { labelId: string; confidence: number }[]>()
  for (const m of maps) {
    const list = byChannel.get(m.channelId) ?? []
    list.push({ labelId: m.labelId, confidence: m.confidence })
    byChannel.set(m.channelId, list)
  }

  let mismatches = 0
  for (const c of channels) {
    const channelMaps = (byChannel.get(c.id) ?? []).sort(
      (a, b) => b.confidence - a.confidence || a.labelId.localeCompare(b.labelId),
    )
    const expected = pickOwnerLabelId(channelMaps) ?? null
    const actual = c.labelId ?? null
    if (expected !== actual) {
      mismatches++
      console.error(
        `MISMATCH  channel="${c.name}" (${c.id})  labelId=${actual ?? 'NULL'}  expected=${expected ?? 'NULL'}  maps=${channelMaps.length}`,
      )
    }
  }

  const withOwner = channels.filter((c) => c.labelId).length
  console.log(
    `Checked ${channels.length} channels (${withOwner} with owning label, ${channels.length - withOwner} null). Mismatches: ${mismatches}.`,
  )
  if (mismatches > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
