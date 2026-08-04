import { describe, expect, it } from 'vitest'
import { candidatesForFolder } from '@/lib/attribution-candidates'

const s = (icgId: string, name: string) => ({ icgId, name })
const v = (icgId: string, name: string, folders: number) => ({ icgId, name, folders })

describe('candidatesForFolder', () => {
  it("puts the folder's own suggestions first", () => {
    const out = candidatesForFolder([s('AI-00QAS', 'Alisa')], [v('ZZ-99', 'Zoe', 40)])
    expect(out.map((c) => c.icgId)).toEqual(['AI-00QAS', 'ZZ-99'])
    expect(out[0].fromFolder).toBe(true)
    expect(out[1].fromFolder).toBe(false)
  })

  // The reason group votes are offered at all: the join often explains only part
  // of a group, and the unexplained folder is usually the same person as its 40
  // neighbours. It is a shortcut to a keystroke, never an answer.
  it('offers the group when the folder itself has no suggestion', () => {
    const out = candidatesForFolder([], [v('AI-00QAS', 'Alisa', 40), v('AL-91XZ', 'Alisa', 2)])
    expect(out.map((c) => c.icgId)).toEqual(['AI-00QAS', 'AL-91XZ'])
    expect(out.every((c) => !c.fromFolder)).toBe(true)
  })

  it('orders group votes by how many folders back them', () => {
    const out = candidatesForFolder([], [v('B', 'B', 1), v('A', 'A', 9), v('C', 'C', 4)])
    expect(out.map((c) => c.icgId)).toEqual(['A', 'C', 'B'])
  })

  it('never lists a person twice, and keeps the folder as the source of truth', () => {
    const out = candidatesForFolder([s('AI-00QAS', 'Alisa')], [v('AI-00QAS', 'Alisa', 40)])
    expect(out).toHaveLength(1)
    expect(out[0].fromFolder).toBe(true)
  })

  it('dedupes repeated suggestions on the same folder', () => {
    const out = candidatesForFolder([s('AI-00QAS', 'Alisa'), s('AI-00QAS', 'Alisa')], [])
    expect(out).toHaveLength(1)
  })

  // A multi-participant folder proposes everyone in it; the operator confirms the
  // set, not a pick from it.
  it('keeps every participant of a multi-person folder, in order', () => {
    const out = candidatesForFolder([s('MX-01', 'Michelle'), s('RX-02', 'Rebecca')], [])
    expect(out.map((c) => c.icgId)).toEqual(['MX-01', 'RX-02'])
  })

  it('returns nothing when neither source knows anyone', () => {
    expect(candidatesForFolder([], [])).toEqual([])
  })

  it('is stable when two votes tie, so the digit keys do not shuffle between renders', () => {
    const first = candidatesForFolder([], [v('B', 'B', 3), v('A', 'A', 3)])
    const second = candidatesForFolder([], [v('A', 'A', 3), v('B', 'B', 3)])
    expect(first.map((c) => c.icgId)).toEqual(second.map((c) => c.icgId))
  })

  it('does not mutate the votes it was given', () => {
    const votes = [v('B', 'B', 1), v('A', 'A', 9)]
    candidatesForFolder([], votes)
    expect(votes.map((x) => x.icgId)).toEqual(['B', 'A'])
  })
})
