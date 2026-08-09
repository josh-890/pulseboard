import { describe, expect, it } from 'vitest'
import {
  EMPTY_REVISION,
  formatPerson,
  parsePeopleFile,
  normalisePersonName,
  parsePersonLine,
  peopleRevision,
  renderPeopleFile,
  type FilePerson,
} from '@/lib/archive-people-file'

const anna: FilePerson = { name: 'Anna Y', icgId: 'AY-006S' }
const bella: FilePerson = { name: 'Bella', icgId: 'BE-01QQ' }
const paula: FilePerson = { name: 'Paula', icgId: 'PA-00X1' }

const render = (credited: FilePerson[], claimed: FilePerson[]) =>
  renderPeopleFile({
    archiveKey: '3f6c9e02-0000-4000-8000-000000000001',
    folderName: '2011-01-16-MPL Talia - The Delicate Edge',
    setLine: 'MPL · 2011-01-16 · "The Delicate Edge"',
    credited,
    claimed,
    generatedAt: new Date('2026-08-08T10:12:00.000Z'),
  })

describe('parsePersonLine', () => {
  it('reads the line format both files share', () => {
    expect(parsePersonLine('Anna Y (AY-006S)')).toEqual(anna)
    expect(parsePersonLine('   Bella (BE-01QQ)  ')).toEqual(bella)
  })

  // The catalogue holds people whose only known name is their ID; a hand-written
  // file should not force the operator to invent one.
  it('accepts a bare ICG-ID and lets it be its own name', () => {
    expect(parsePersonLine('AY-006S')).toEqual({ name: 'AY-006S', icgId: 'AY-006S' })
  })

  // The catalogue writes Iveta_C_(IC-87VY), a person types Iveta C (IC-87VY), and
  // either may arrive lower-cased. All three are the same person — the ICG-ID says
  // so — and they must not become three differently-spelled entries.
  it('reads the same person from every written form of the name', () => {
    const expected = { name: 'Iveta C', icgId: 'IC-87VY' }
    expect(parsePersonLine('Iveta C (IC-87VY)')).toEqual(expected)
    expect(parsePersonLine('Iveta_C_(IC-87VY)')).toEqual(expected)
    expect(parsePersonLine('Iveta   C  (IC-87VY)')).toEqual(expected)
    expect(parsePersonLine('iveta c (ic-87vy)')).toEqual({ name: 'iveta c', icgId: 'IC-87VY' })
  })

  // Letters stay as written: this is a display name, and title-casing it would be a
  // guess the file has no business making.
  it('normalises the separators, not the spelling', () => {
    expect(normalisePersonName('Iveta_C_')).toBe('Iveta C')
    expect(normalisePersonName('  anna   y  ')).toBe('anna y')
  })

  it('accepts a self-assigned ID (ADR-0026 marks them with @)', () => {
    expect(parsePersonLine('Someone (ZZ-90@AAA)')).toEqual({ name: 'Someone', icgId: 'ZZ-90@AAA' })
  })

  // A mistyped ID usually points at a real other person, so anything that is not a
  // well-formed ICG-ID has to be refused rather than guessed at.
  it('refuses anything that is not a well-formed ICG-ID', () => {
    expect(parsePersonLine('Anna Y (not-an-id)')).toBeNull()
    expect(parsePersonLine('Anna Y')).toBeNull()
    expect(parsePersonLine('Anna Y (<b>AY-006S</b>)')).toBeNull()
  })
})

describe('parsePeopleFile', () => {
  // One person, three spellings, one entry — the dedupe keys on the ICG-ID.
  it('does not list one person three times for three spellings', () => {
    const parsed = parsePeopleFile('Iveta C (IC-87VY)\nIveta_C_(IC-87VY)\niveta c (ic-87vy)\n')
    expect(parsed.claimed).toEqual([{ name: 'Iveta C', icgId: 'IC-87VY' }])
  })

  it('reads back what it wrote, sections intact', () => {
    const text = render([anna, bella], [paula])!
    const parsed = parsePeopleFile(text)
    expect(parsed.credited).toEqual([anna, bella])
    expect(parsed.claimed).toEqual([paula])
    expect(parsed.revision).toBe(peopleRevision([anna, bella], [paula]))
    expect(parsed.errors).toEqual([])
  })

  // The shape that breaks in PowerShell JSON: a single-element list. Text cannot
  // collapse it, and this asserts that it does not.
  it('round-trips a one-person set', () => {
    const parsed = parsePeopleFile(render([anna], [])!)
    expect(parsed.credited).toEqual([anna])
    expect(parsed.claimed).toEqual([])
  })

  // A hand-written _cast.txt carries no section markers at all, and everything in
  // it is a claim about the folder.
  it('treats an unmarked file as claims', () => {
    const parsed = parsePeopleFile('# my notes\n\nAnna Y (AY-006S)\nPA-00X1\n')
    expect(parsed.claimed).toEqual([anna, { name: 'PA-00X1', icgId: 'PA-00X1' }])
    expect(parsed.credited).toEqual([])
    expect(parsed.revision).toBeNull()
  })

  it('reports malformed lines instead of dropping them', () => {
    const parsed = parsePeopleFile('Anna Y (AY-006S)\nwho even is this\n')
    expect(parsed.claimed).toEqual([anna])
    expect(parsed.errors).toEqual(['who even is this'])
  })

  it('ignores comments and blank lines, and does not repeat a person', () => {
    const parsed = parsePeopleFile('# comment\n\nAnna Y (AY-006S)\n\nAnna Y (AY-006S)\n')
    expect(parsed.claimed).toEqual([anna])
  })
})

describe('peopleRevision', () => {
  it('does not change when the order does', () => {
    expect(peopleRevision([anna, bella], [])).toBe(peopleRevision([bella, anna], []))
  })

  it('changes when a person or a name changes', () => {
    const base = peopleRevision([anna], [])
    expect(peopleRevision([bella], [])).not.toBe(base)
    expect(peopleRevision([{ ...anna, name: 'Anna Yolanda' }], [])).not.toBe(base)
  })

  // The same people in the other section is a different statement about the folder.
  it('distinguishes a credit from a claim', () => {
    expect(peopleRevision([anna], [])).not.toBe(peopleRevision([], [anna]))
  })

  it('is EMPTY when the app knows nobody', () => {
    expect(peopleRevision([], [])).toBe(EMPTY_REVISION)
  })
})

describe('renderPeopleFile', () => {
  it('writes nothing at all when there is nobody', () => {
    expect(render([], [])).toBeNull()
  })

  it('omits a section that has no one in it', () => {
    const text = render([anna], [])!
    expect(text).toContain('# credited')
    expect(text).not.toContain('# claimed')
  })

  it('says where hand-written entries belong', () => {
    expect(render([anna], [])!).toContain('_cast.txt')
  })
})

describe('formatPerson', () => {
  it('does not print an ID twice', () => {
    expect(formatPerson({ name: 'AY-006S', icgId: 'AY-006S' })).toBe('AY-006S')
    expect(formatPerson(anna)).toBe('Anna Y (AY-006S)')
  })
})
