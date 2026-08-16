import { describe, expect, it } from 'vitest'
import { archiveCoverKeyFor } from '@/lib/services/import/staging-set-service'

// A set developed from an archive folder has no cover of its own, and the picture
// that belongs to it is already in MinIO under that folder. Getting the precedence
// wrong is quiet: you either see a grey box where an image exists, or someone
// else's folder image on your set.

const link = (status: string, coverKey: string | null) => ({
  status,
  archiveFolder: coverKey === null ? null : { coverKey },
})

describe('archiveCoverKeyFor', () => {
  it('takes the confirmed folder’s cover', () => {
    expect(
      archiveCoverKeyFor({ archiveLinks: [link('CONFIRMED', 'archive/a/cover.jpg')], promotedSet: null }),
    ).toBe('archive/a/cover.jpg')
  })

  // A suggestion is not yet a claim about which folder this set is.
  it('ignores a merely suggested folder', () => {
    expect(
      archiveCoverKeyFor({ archiveLinks: [link('SUGGESTED', 'archive/guess/cover.jpg')], promotedSet: null }),
    ).toBeNull()
  })

  // Promotion moves the link to the Set, so that is where to look first.
  it('prefers the promoted set’s link', () => {
    expect(
      archiveCoverKeyFor({
        archiveLinks: [link('CONFIRMED', 'archive/stale/cover.jpg')],
        promotedSet: { archiveLinks: [link('CONFIRMED', 'archive/current/cover.jpg')] },
      }),
    ).toBe('archive/current/cover.jpg')
  })

  it('is null when there is no link, no folder or no cover', () => {
    expect(archiveCoverKeyFor({ archiveLinks: [], promotedSet: null })).toBeNull()
    expect(archiveCoverKeyFor({ archiveLinks: [link('CONFIRMED', null)], promotedSet: null })).toBeNull()
    expect(
      archiveCoverKeyFor({ archiveLinks: [{ status: 'CONFIRMED', archiveFolder: { coverKey: null } }], promotedSet: null }),
    ).toBeNull()
  })
})
