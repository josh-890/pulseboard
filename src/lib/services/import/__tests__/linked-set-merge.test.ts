import { describe, expect, it } from 'vitest'
import { fieldsToFill, mergeCast } from '@/lib/services/import/linked-set-merge'

describe('fieldsToFill', () => {
  // The collision key already pins channel, date, type and normalised title, so
  // everything else is either missing on the stub or cosmetically different.
  // Overwriting would buy nothing and could clobber something touched by hand.
  type Stub = { externalId: string | null; description: string | null; imageCount: number | null }

  it('fills what is missing and touches nothing else', () => {
    const existing: Partial<Stub> = { externalId: null, description: 'written by hand', imageCount: 40 }
    const incoming: Partial<Stub> = { externalId: 'ext-1', description: 'from the publisher', imageCount: 88 }
    expect(fieldsToFill(existing, incoming)).toEqual({ externalId: 'ext-1' })
  })

  it('treats an empty string as missing, not as a decision', () => {
    const existing: Partial<{ artist: string | null }> = { artist: '' }
    expect(fieldsToFill(existing, { artist: 'Dan' })).toEqual({ artist: 'Dan' })
  })

  it('never writes an absence over a value', () => {
    const existing: Partial<{ description: string | null }> = { description: null }
    expect(fieldsToFill(existing, { description: null })).toEqual({})
    expect(fieldsToFill(existing, { description: '' })).toEqual({})
  })
})

describe('mergeCast', () => {
  const A = { name: 'Anna', icgId: 'ZZ-95@AAA' }
  const B = { name: 'Bella', icgId: 'ZZ-95@BBB' }
  const P = { name: 'Paula', icgId: 'ZZ-95@PPP' }

  it('takes the cast from the import and keeps the loser as a claim', () => {
    const merged = mergeCast([P], [A, B])
    expect(merged.cast).toEqual([A, B])
    expect(merged.preservedAsClaims).toEqual([P])
  })

  it('says nothing about someone the import also credits', () => {
    const merged = mergeCast([A], [A, B])
    expect(merged.cast).toEqual([A, B])
    expect(merged.preservedAsClaims).toEqual([])
  })

  // An attribution needs an ICG-ID. Someone added by hand without one has nowhere
  // else to live, so dropping them would destroy information outright.
  it('keeps a cast member who has no ICG-ID', () => {
    const hand = { name: 'Someone', icgId: '' }
    const merged = mergeCast([hand], [A])
    expect(merged.cast).toEqual([A, hand])
    expect(merged.keptWithoutIcgId).toEqual([hand])
    expect(merged.preservedAsClaims).toEqual([])
  })

  it('does not double someone the import names under the same name', () => {
    const merged = mergeCast([{ name: 'anna', icgId: '' }], [A])
    expect(merged.cast).toEqual([A])
    expect(merged.keptWithoutIcgId).toEqual([])
  })

  it('is empty-safe at both ends', () => {
    expect(mergeCast([], [A]).cast).toEqual([A])
    expect(mergeCast([P], []).cast).toEqual([])
    expect(mergeCast([P], []).preservedAsClaims).toEqual([P])
  })
})
