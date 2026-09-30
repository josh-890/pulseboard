/**
 * Stub archive folders (ADR-0032) — the pure half: names, labels and the
 * reconciliation between the app's flag and `.pulseboard\STUB` on disk.
 *
 * Client-safe: no Prisma client, no Node APIs.
 */

import type { StubReason } from '@/generated/prisma/enums'

/** The marker's base name inside `.pulseboard\`. Any extension is tolerated. */
export const STUB_MARKER = 'STUB'

export type ArchiveStub = {
  since: Date
  reason: StubReason
  note: string | null
}

export const STUB_REASON_LABEL: Record<StubReason, string> = {
  FEW_MEDIA: 'Few media',
  LOW_QUALITY: 'Low quality',
  BOTH: 'Few media, low quality',
}

export const STUB_REASONS: StubReason[] = ['FEW_MEDIA', 'LOW_QUALITY', 'BOTH']

/** The stub a folder row describes, or null. */
export function toArchiveStub(folder: {
  stubSince: Date | null
  stubReason: StubReason | null
  stubNote: string | null
}): ArchiveStub | null {
  if (!folder.stubSince) return null
  return { since: folder.stubSince, reason: folder.stubReason ?? 'BOTH', note: folder.stubNote }
}

/**
 * `STUB`, `STUB.txt`, `stub.TXT` — Explorer's "New → Text Document" appends an
 * extension, and losing the mark over that would be silent.
 */
export function isStubMarkerName(fileName: string): boolean {
  const base = fileName.trim().replace(/\.[^.]*$/, '')
  return base.toUpperCase() === STUB_MARKER
}

export type StubReconcileInput = {
  /** Does `.pulseboard\STUB` exist now? */
  diskNow: boolean
  /** What the disk said at the last reconciliation; null = never reported. */
  lastSeen: boolean | null
  /** Is the folder a stub in the app now? */
  appNow: boolean
}

export type StubReconcileResult = {
  /** The app's flag after reconciliation. */
  appNext: boolean
  /** What the disk should hold — the agent writes or removes `STUB` to match. */
  diskWanted: boolean
  /** Store as the new remembered disk state. */
  lastSeenNext: boolean
  /** Which side moved: the disk's change is adopted, the app's is written out. */
  source: 'none' | 'disk' | 'app' | 'both'
}

/**
 * Three-way reconciliation (ADR-0032 §3), the way Lightroom keeps a catalogue and
 * its XMP sidecars in step: the remembered disk state tells which side changed.
 * The flag is a boolean, so two sides that both changed from the same value agree
 * — there is no conflict case. Before the first report the two are united: a stub
 * on either side is a stub.
 */
export function reconcileStub({ diskNow, lastSeen, appNow }: StubReconcileInput): StubReconcileResult {
  if (lastSeen === null) {
    const appNext = appNow || diskNow
    const source = diskNow && !appNow ? 'disk' : appNow && !diskNow ? 'app' : 'none'
    return { appNext, diskWanted: appNext, lastSeenNext: diskNow, source }
  }
  const diskChanged = diskNow !== lastSeen
  const appChanged = appNow !== lastSeen
  if (diskChanged && !appChanged) {
    return { appNext: diskNow, diskWanted: diskNow, lastSeenNext: diskNow, source: 'disk' }
  }
  if (appChanged && !diskChanged) {
    return { appNext: appNow, diskWanted: appNow, lastSeenNext: diskNow, source: 'app' }
  }
  return { appNext: appNow, diskWanted: appNow, lastSeenNext: diskNow, source: diskChanged ? 'both' : 'none' }
}
