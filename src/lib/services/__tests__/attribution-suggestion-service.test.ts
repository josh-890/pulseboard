import { describe, expect, it } from 'vitest'
import {
  aggregateAttributionGroups,
  parseSuggestionBatch,
  type GroupableFolder,
} from '@/lib/services/attribution-suggestion-service'

const folder = (
  folderName: string,
  parsedShortName: string | null,
  suggestions: { icgId: string; name: string; demotions?: string[] }[] = [],
): GroupableFolder => ({
  folderName,
  parsedShortName,
  suggestions: suggestions.map((s) => ({ ...s, demotions: s.demotions ?? [] })),
})

describe('parseSuggestionBatch', () => {
  const ok = { archiveKey: 'k1', icgId: 'CX-82HO', name: 'Nicole', tier: 'EXACT', score: 1 }

  it('accepts a well-formed batch', () => {
    const r = parseSuggestionBatch({ source: 'CATALOGUE', suggestions: [ok] })
    expect(r).toEqual({
      source: 'CATALOGUE',
      suggestions: [
        { archiveKey: 'k1', icgId: 'CX-82HO', name: 'Nicole', tier: 'EXACT', score: 1, demotions: [], evidence: undefined },
      ],
    })
  })

  it('rejects an unknown source', () => {
    expect(parseSuggestionBatch({ source: 'GUESSWORK', suggestions: [] })).toHaveProperty('error')
  })

  it('rejects an unknown tier', () => {
    const r = parseSuggestionBatch({ source: 'CATALOGUE', suggestions: [{ ...ok, tier: 'PROBABLY' }] })
    expect(r).toHaveProperty('error')
  })

  // All-or-nothing: a batch that lands half-way leaves the agent unable to say
  // what was stored, and ingest REPLACES a folder's rows rather than merging.
  it('rejects the whole batch when one entry is bad', () => {
    const r = parseSuggestionBatch({
      source: 'CATALOGUE',
      suggestions: [ok, { ...ok, archiveKey: '' }, ok],
    })
    expect(r).toHaveProperty('error')
    expect(r).not.toHaveProperty('suggestions')
  })

  it('drops demotion reasons it does not know, keeping the ones it does', () => {
    const r = parseSuggestionBatch({
      source: 'CATALOGUE',
      suggestions: [{ ...ok, demotions: ['CROSS_LABEL', 'VIBES', 'AMBIGUOUS'] }],
    })
    expect(r).toMatchObject({ suggestions: [{ demotions: ['CROSS_LABEL', 'AMBIGUOUS'] }] })
  })

  // The fail-closed counterpart of CROSS_LABEL: the folder's short code resolves
  // to no Channel, so the cross-label check could not run. Dropping this reason
  // would make an unchecked suggestion look exactly like one that passed.
  it('keeps UNKNOWN_CHANNEL', () => {
    const r = parseSuggestionBatch({
      source: 'CATALOGUE',
      suggestions: [{ ...ok, demotions: ['UNKNOWN_CHANNEL'] }],
    })
    expect(r).toMatchObject({ suggestions: [{ demotions: ['UNKNOWN_CHANNEL'] }] })
  })

  it('falls back to the ICG-ID when no name is supplied', () => {
    const r = parseSuggestionBatch({ source: 'CATALOGUE', suggestions: [{ ...ok, name: undefined }] })
    expect(r).toMatchObject({ suggestions: [{ name: 'CX-82HO' }] })
  })

  it('coerces a non-finite score to 0 rather than storing NaN', () => {
    const r = parseSuggestionBatch({ source: 'CATALOGUE', suggestions: [{ ...ok, score: Number.NaN }] })
    expect(r).toMatchObject({ suggestions: [{ score: 0 }] })
  })
})

describe('aggregateAttributionGroups', () => {
  it('folds folders sharing a channel and an alias into one group', () => {
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 MPLSTUDIOS - Candy', 'MPLSTUDIOS', [{ icgId: 'SX-01', name: 'Sybil A' }]),
      folder('2016-01-02 MPLSTUDIOS - Sunrise', 'MPLSTUDIOS', [{ icgId: 'SX-01', name: 'Sybil A' }]),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].folders).toBe(2)
    expect(groups[0].votes).toEqual([{ icgId: 'SX-01', name: 'Sybil A', folders: 2 }])
  })

  it('keeps the same alias on different channels apart', () => {
    // ADR-0024: an alias is only meaningful within its channel, so "Candy" on two
    // channels is two aliases and must stay two decisions.
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 MPLSTUDIOS - Candy', 'MPLSTUDIOS'),
      folder('2015-05-20 FEMJOY - Candy', 'FEMJOY'),
    ])
    expect(groups).toHaveLength(2)
  })

  it('records conflicting votes instead of picking a winner', () => {
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 MPL - Candy', 'MPL', [{ icgId: 'SX-01', name: 'Sybil A' }]),
      folder('2016-05-20 MPL - Candy', 'MPL', [{ icgId: 'SX-01', name: 'Sybil A' }]),
      folder('2017-05-20 MPL - Candy', 'MPL', [{ icgId: 'ZX-02', name: 'Zoe' }]),
    ])
    expect(groups[0].votes).toEqual([
      { icgId: 'SX-01', name: 'Sybil A', folders: 2 },
      { icgId: 'ZX-02', name: 'Zoe', folders: 1 },
    ])
  })

  it('counts one folder once per person even with suggestions from two sources', () => {
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 MPL - Candy', 'MPL', [
        { icgId: 'SX-01', name: 'Sybil A' },
        { icgId: 'SX-01', name: 'Sybil A' },
      ]),
    ])
    expect(groups[0].votes).toEqual([{ icgId: 'SX-01', name: 'Sybil A', folders: 1 }])
  })

  it('counts every participant of a multi-person folder', () => {
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 FJ - Michelle & Rebecca', 'FJ', [
        { icgId: 'MX-01', name: 'Michelle' },
        { icgId: 'RX-02', name: 'Rebecca' },
      ]),
    ])
    expect(groups[0].votes.map((v) => v.icgId).sort()).toEqual(['MX-01', 'RX-02'])
  })

  it('treats any demotion reason as demoting the group, not only CROSS_LABEL', () => {
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 AMK - Candy', 'AMK', [
        { icgId: 'SX-01', name: 'Sybil A', demotions: ['UNKNOWN_CHANNEL'] },
      ]),
    ])
    expect(groups[0].demotedFolders).toBe(1)
  })

  it('carries a demotion up to the group so review is visible before opening it', () => {
    const groups = aggregateAttributionGroups([
      folder('2015-05-20 MPL - Candy', 'MPL', [
        { icgId: 'SX-01', name: 'Sybil A', demotions: ['CROSS_LABEL'] },
      ]),
      folder('2016-05-20 MPL - Candy', 'MPL', [{ icgId: 'SX-01', name: 'Sybil A' }]),
    ])
    expect(groups[0].demotedFolders).toBe(1)
    expect(groups[0].folders).toBe(2)
  })

  it('keeps a folder with no suggestion in its group, with no votes', () => {
    // A silent group is still work: it tells the operator the join explained
    // nothing here, which dropping the row would hide.
    const groups = aggregateAttributionGroups([folder('2015-05-20 MPL - Candy', 'MPL')])
    expect(groups[0].folders).toBe(1)
    expect(groups[0].votes).toEqual([])
  })

  it('orders groups by size and honours minFolders and limit', () => {
    const rows = [
      folder('2015-01-01 A - One', 'A'),
      folder('2015-01-02 A - One', 'A'),
      folder('2015-01-03 A - One', 'A'),
      folder('2015-01-01 B - Two', 'B'),
      folder('2015-01-02 B - Two', 'B'),
      folder('2015-01-01 C - Three', 'C'),
    ]
    expect(aggregateAttributionGroups(rows).map((g) => g.folders)).toEqual([3, 2, 1])
    expect(aggregateAttributionGroups(rows, { minFolders: 2 })).toHaveLength(2)
    expect(aggregateAttributionGroups(rows, { limit: 1 })).toHaveLength(1)
  })
})
