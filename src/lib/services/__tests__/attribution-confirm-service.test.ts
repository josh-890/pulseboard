import { describe, expect, it } from 'vitest'
import {
  planAttributions,
  namesForConfirmation,
  type GroupMember,
} from '@/lib/services/attribution-confirm-service'

const member = (id: string, suggestions: [string, string][] = []): GroupMember => ({
  id,
  suggestions: suggestions.map(([icgId, name]) => ({ icgId, name })),
})

describe('planAttributions', () => {
  it('attributes a unanimous group to everyone', () => {
    const plan = planAttributions(
      [member('f1', [['SX-01', 'Sybil A']]), member('f2', [['SX-01', 'Sybil A']])],
      ['SX-01'],
    )
    expect([...plan.perFolder.entries()]).toEqual([
      ['f1', ['SX-01']],
      ['f2', ['SX-01']],
    ])
    expect(plan.dissenting).toEqual([])
  })

  // The rule the whole feature's safety rests on. In MPL|nata, 80 folders name
  // Nata and 3 name someone else; confirming Nata must not touch those 3.
  it('never attributes a folder that named someone else', () => {
    const plan = planAttributions(
      [
        member('f1', [['NA-01', 'Nata']]),
        member('f2', [['NA-01', 'Nata']]),
        member('f3', [['EM-02', 'Emilianna']]),
      ],
      ['NA-01'],
    )
    expect([...plan.perFolder.keys()]).toEqual(['f1', 'f2'])
    expect(plan.dissenting).toEqual(['f3'])
  })

  it('leaves folders with no suggestion alone', () => {
    const plan = planAttributions([member('f1', [['SX-01', 'Sybil A']]), member('f2')], ['SX-01'])
    expect([...plan.perFolder.keys()]).toEqual(['f1'])
    expect(plan.silent).toEqual(['f2'])
    expect(plan.dissenting).toEqual([])
  })

  it('gives a multi-person folder every confirmed person it names', () => {
    const both: [string, string][] = [
      ['MX-01', 'Michelle'],
      ['RX-02', 'Rebecca'],
    ]
    const plan = planAttributions([member('f1', both)], ['MX-01', 'RX-02'])
    expect(plan.perFolder.get('f1')).toEqual(['MX-01', 'RX-02'])
  })

  // Confirming one person out of a conflicted group is the escape hatch for
  // aliases two people share — the other person's folders must stay untouched.
  it('confirming one of several people splits the group', () => {
    const plan = planAttributions(
      [
        member('f1', [['MX-01', 'Michelle']]),
        member('f2', [['RX-02', 'Rebecca']]),
        member('f3', [['MX-01', 'Michelle']]),
      ],
      ['MX-01'],
    )
    expect([...plan.perFolder.keys()]).toEqual(['f1', 'f3'])
    expect(plan.dissenting).toEqual(['f2'])
  })

  it('does not attribute the same person twice for one folder', () => {
    // Two sources can suggest the same person for one folder.
    const plan = planAttributions(
      [
        member('f1', [
          ['SX-01', 'Sybil A'],
          ['SX-01', 'Sybil A'],
        ]),
      ],
      ['SX-01'],
    )
    expect(plan.perFolder.get('f1')).toEqual(['SX-01'])
  })

  it('attributes nothing when the confirmed person appears nowhere', () => {
    const plan = planAttributions([member('f1', [['SX-01', 'Sybil A']])], ['ZZ-99'])
    expect(plan.perFolder.size).toBe(0)
    expect(plan.dissenting).toEqual(['f1'])
  })
})

describe('namesForConfirmation', () => {
  it('takes the name from the suggestions carrying the person', () => {
    const names = namesForConfirmation([member('f1', [['SX-01', 'Sybil A']])], ['SX-01'])
    expect(names.get('SX-01')).toBe('Sybil A')
  })

  it('falls back to the ICG-ID when nothing names the person', () => {
    const names = namesForConfirmation([member('f1')], ['MX-00D2A'])
    expect(names.get('MX-00D2A')).toBe('MX-00D2A')
  })

  it('keeps the first name seen rather than the last', () => {
    const names = namesForConfirmation(
      [member('f1', [['SX-01', 'Sybil A']]), member('f2', [['SX-01', 'Sybil']])],
      ['SX-01'],
    )
    expect(names.get('SX-01')).toBe('Sybil A')
  })
})
