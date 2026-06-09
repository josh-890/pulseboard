// ADR-0009: DB-aware orchestration for the re-import review.
//
// Loads the matched person's current snapshot, converts ParsedPersonData
// into an ImportPayload, and calls computeImportDiff. The result is stored
// on ImportItem.decisions. This module DOES touch Prisma; the pure diff
// math lives in `./diff.ts`.

import type { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'
import type { ParsedPersonData } from './parser'
import { parseBreastDescription, extractCupFromMeasurements, chooseNaturalCup, canonicaliseBreastCup } from './import-utils'
import { resolveNationalityToIoc } from '@/lib/constants/countries'
import {
  computeImportDiff,
  type ImportItemDecisions,
  type ImportPayload,
  type MatchedPersonSnapshot,
} from './diff'

type TxClient = Prisma.TransactionClient | PrismaClient

// Translate raw parsed person data → ImportPayload (the shape the diff
// helper consumes). Mirrors the field translations import-executor.ts
// performs during a first-time import.
export function buildImportPayloadFromParsed(data: ParsedPersonData): ImportPayload {
  // Birthdate
  let birthdateIso: string | undefined
  let birthdatePrecision: string | undefined
  if (data.birthYear) {
    if (data.birthMonth) {
      const monthNum = monthNameToNumber(data.birthMonth)
      if (monthNum) {
        birthdateIso = `${data.birthYear}-${monthNum}-01`
        birthdatePrecision = 'MONTH'
      } else {
        birthdateIso = `${data.birthYear}-01-01`
        birthdatePrecision = 'YEAR'
      }
    } else {
      birthdateIso = `${data.birthYear}-01-01`
      birthdatePrecision = 'YEAR'
    }
  }

  // Active from
  const activeFromIso = data.activeFromYear ? `${data.activeFromYear}-01-01` : undefined

  // Retired (presence flips status; for the diff we just compare the date).
  const retiredAtIso = data.retiredYear ? `${data.retiredYear}-01-01` : undefined

  // Nationality → 3-letter IOC code (mirrors import-executor).
  const nationality = data.nationality
    ? resolveNationalityToIoc(data.nationality) ?? undefined
    : undefined

  // Bio composition mirrors importPerson(): biography + biographies + tattoos + activities
  const bioParts: string[] = []
  if (data.biography) bioParts.push(data.biography)
  if (data.biographies) bioParts.push(data.biographies)
  if (data.tattoos) bioParts.push(`Tattoos: ${data.tattoos}`)
  if (data.activities) bioParts.push(`Activities: ${data.activities}`)
  const bio = bioParts.length > 0 ? bioParts.join('\n\n') : undefined

  // Breast size — same logic as import-executor (chooseNaturalCup honours
  // the ADR-0008 source-explicit-status carve-out).
  const breastParsed = data.breastDescription
    ? parseBreastDescription(data.breastDescription)
    : null
  const cupFromMeasurements = data.measurements
    ? extractCupFromMeasurements(data.measurements)
    : null
  const cupAny = cupFromMeasurements ?? breastParsed?.cupSize ?? null
  const naturalCup = chooseNaturalCup(cupAny, breastParsed?.status ?? null)

  const scalars: Record<string, string> = {}
  if (data.hairColor) scalars['hair_color'] = data.hairColor
  if (naturalCup) scalars['breast_size'] = canonicaliseBreastCup(naturalCup)!
  if (data.heightCm != null) scalars['height'] = String(data.heightCm)
  if (data.measurements) scalars['measurements'] = data.measurements
  // Imports today don't carry: weight, build, hair-length, eye-color,
  // ethnicity-broad, ethnicity-specific in the structured fields above.
  // If parser extracts them in the future, set them here too.

  // Verbatim source strings for slugs whose parsed value loses info. Carried
  // through to ScalarDelta.notes so the description survives a re-import.
  const scalarNotes: Record<string, string> = {}
  if (data.breastDescription) scalarNotes['breast_size'] = data.breastDescription

  return {
    birthdateIso,
    birthdatePrecision,
    nationality,
    activeFromIso,
    retiredAtIso,
    bio,
    sexAtBirth: undefined,
    birthPlace: undefined,
    commonName: data.name,
    birthName: undefined,
    scalars,
    scalarNotes,
  }
}

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
}
function monthNameToNumber(month: string): string | null {
  return MONTH_MAP[month.toLowerCase()] ?? null
}

/**
 * Load a person snapshot in the shape the diff helper consumes. Reads
 * Person columns, common/birth aliases, and baseline scalar deltas.
 */
export async function loadMatchedPersonSnapshot(
  tx: TxClient,
  personId: string,
): Promise<MatchedPersonSnapshot> {
  const person = await tx.person.findUniqueOrThrow({
    where: { id: personId },
    select: {
      birthdate: true,
      birthdatePrecision: true,
      nationality: true,
      activeFrom: true,
      retiredAt: true,
      bio: true,
      sexAtBirth: true,
      birthPlace: true,
      aliases: { select: { name: true, isCommon: true, isBirth: true } },
      eras: {
        where: { isBaseline: true },
        select: {
          scalarDeltas: {
            select: {
              value: true,
              isVerifiedUnknown: true,
              attributeDefinition: { select: { slug: true } },
            },
          },
        },
      },
    },
  })

  const baselineScalars = new Map<string, { value: string; isVerifiedUnknown: boolean }>()
  for (const era of person.eras) {
    for (const sd of era.scalarDeltas) {
      // Multiple deltas for the same slug on one Era can happen with
      // verified-unknown shadowing; the latest-create-time wins in the
      // fold, but for diff purposes the existence of either is enough.
      // Keep the verified-unknown signal if any delta has it.
      const existing = baselineScalars.get(sd.attributeDefinition.slug)
      baselineScalars.set(sd.attributeDefinition.slug, {
        value: sd.value,
        isVerifiedUnknown: existing?.isVerifiedUnknown || sd.isVerifiedUnknown,
      })
    }
  }

  return {
    birthdate: person.birthdate,
    birthdatePrecision: person.birthdatePrecision,
    nationality: person.nationality,
    activeFrom: person.activeFrom,
    retiredAt: person.retiredAt,
    bio: person.bio,
    sexAtBirth: person.sexAtBirth,
    birthPlace: person.birthPlace,
    aliases: person.aliases,
    baselineScalars,
  }
}

/**
 * End-to-end: load snapshot + build payload + compute diff. Returned
 * as the JSON shape ready to write to ImportItem.decisions.
 *
 * Phase 2: when `currentBatchId` is supplied, alias decision rows are
 * annotated with cross-batch context (prior declines + manual deletions
 * of the same itemKey) so the review UI can surface "Previously declined
 * 2026-04-20" / "Previously manually deleted 2026-03-10" subtitles. The
 * current batch is excluded from the decline-log lookup (those entries
 * are the live save state, not history).
 */
export async function buildImportItemDecisions(
  tx: TxClient,
  matchedPersonId: string,
  data: ParsedPersonData,
  currentBatchId?: string,
): Promise<ImportItemDecisions> {
  const matched = await loadMatchedPersonSnapshot(tx, matchedPersonId)
  const payload = buildImportPayloadFromParsed(data)
  const decisions = computeImportDiff(payload, matched)

  if (decisions.aliases.length === 0) return decisions

  // Single-pass context lookup for the diff's alias keys.
  const aliasKeys = decisions.aliases.map((a) => a.itemKey)
  const [declineRows, tombstoneRows] = await Promise.all([
    tx.importDeclineLog.findMany({
      where: {
        personId: matchedPersonId,
        kind: 'alias',
        itemKey: { in: aliasKeys },
        ...(currentBatchId ? { declinedInBatchId: { not: currentBatchId } } : {}),
      },
      select: { itemKey: true, declinedAt: true },
      orderBy: { declinedAt: 'desc' },
    }),
    tx.itemDeletionTombstone.findMany({
      where: {
        personId: matchedPersonId,
        kind: 'alias',
        itemKey: { in: aliasKeys },
      },
      select: { itemKey: true, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    }),
  ])

  const declineByKey = new Map<string, Date[]>()
  for (const r of declineRows) {
    const arr = declineByKey.get(r.itemKey) ?? []
    arr.push(r.declinedAt)
    declineByKey.set(r.itemKey, arr)
  }
  // Most recent tombstone wins if multiple exist (unlikely but possible
  // if an alias was re-created then re-deleted across batches).
  const tombstoneByKey = new Map<string, Date>()
  for (const r of tombstoneRows) {
    if (!tombstoneByKey.has(r.itemKey)) tombstoneByKey.set(r.itemKey, r.deletedAt)
  }

  for (const row of decisions.aliases) {
    const dates = declineByKey.get(row.itemKey)
    const tombstone = tombstoneByKey.get(row.itemKey)
    if (!dates && !tombstone) continue
    row.context = {
      ...(dates ? { declinedDates: dates.map((d) => d.toISOString()) } : {}),
      ...(tombstone ? { manuallyDeletedAt: tombstone.toISOString() } : {}),
    }
  }

  return decisions
}
