import { describe, expect, it } from 'vitest'
import {
  EMPTY_REVISION,
  formatPerson,
  normalisePersonName,
  parseCastFile,
  parseCastMarkerName,
  parsePersonLine,
  peopleRevision,
  renderCastFile,
  type FilePerson,
} from '@/lib/archive-people-file'

const anna: FilePerson = { name: 'Anna Y', icgId: 'AY-006S' }
const bella: FilePerson = { name: 'Bella', icgId: 'BE-01QQ' }
const paula: FilePerson = { name: 'Paula', icgId: 'PA-00X1' }

const render = (credited: FilePerson[], claimed: FilePerson[]) =>
  renderCastFile({
    archiveKey: '3f6c9e02-0000-4000-8000-000000000001',
    folderName: '2011-01-16-MPL Talia - The Delicate Edge',
    set: { channel: 'MPL', releaseDate: '2011-01-16', title: 'The Delicate Edge' },
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

describe('parseCastMarkerName', () => {
  const iveta = { name: 'Iveta C', icgId: 'IC-87VY' }

  // The whole statement is the filename, and it arrives in whatever form the
  // operator's hands produced — including Explorer's "New → Text Document", which
  // appends .txt. Dropping a claim over an extension would be silent data loss.
  it('reads a person from every form a marker can take', () => {
    expect(parseCastMarkerName('Iveta_C_(IC-87VY)')).toEqual(iveta)
    expect(parseCastMarkerName('Iveta C (IC-87VY)')).toEqual(iveta)
    expect(parseCastMarkerName('Iveta C (IC-87VY).txt')).toEqual(iveta)
    expect(parseCastMarkerName('iveta c (ic-87vy)')).toEqual({ name: 'iveta c', icgId: 'IC-87VY' })
  })

  it('accepts a bare ICG-ID, with or without an extension', () => {
    expect(parseCastMarkerName('IC-87VY')).toEqual({ name: 'IC-87VY', icgId: 'IC-87VY' })
    expect(parseCastMarkerName('ic-87vy.txt')).toEqual({ name: 'IC-87VY', icgId: 'IC-87VY' })
  })

  // Our own files share the folder with the markers. If any of them parsed, the app
  // would invent a person out of its own bookkeeping.
  it('never mistakes one of our own files for a person', () => {
    expect(parseCastMarkerName('pulseboard.json')).toBeNull()
    expect(parseCastMarkerName('cast.json')).toBeNull()
    expect(parseCastMarkerName('index.tsv')).toBeNull()
    expect(parseCastMarkerName('.media-date-plan.json')).toBeNull()
  })

  it('refuses a malformed ID rather than guessing', () => {
    expect(parseCastMarkerName('Iveta (IC-87)')).toBeNull()
    expect(parseCastMarkerName('Iveta C')).toBeNull()
    expect(parseCastMarkerName('')).toBeNull()
  })
})

describe('the generated cast.json', () => {
  it('reads back what it wrote, sections intact', () => {
    const parsed = parseCastFile(render([anna, bella], [paula])!)
    expect(parsed.credited).toEqual([anna, bella])
    expect(parsed.claimed).toEqual([paula])
    expect(parsed.revision).toBe(peopleRevision([anna, bella], [paula]))
    expect(parsed.errors).toEqual([])
  })

  // The agent compares 34k folders per scan by reading the first lines of each
  // file. That only works while revision is the first key.
  it('writes revision as the very first key', () => {
    const first = render([anna], [])!.split('\n')[1]
    expect(first).toContain('"revision"')
  })

  it('round-trips a one-person set', () => {
    const parsed = parseCastFile(render([anna], [])!)
    expect(parsed.credited).toEqual([anna])
    expect(parsed.claimed).toEqual([])
  })

  it('says where hand-written entries belong', () => {
    expect(render([anna], [])!).toContain('marker files')
  })

  // The file lives on a disk that gets moved, copied and restored. Half a file is
  // not a reason to fail a scan.
  it('survives a truncated or foreign file without throwing', () => {
    expect(parseCastFile('{"revision": "abc"').errors).toEqual(['unreadable cast.json'])
    expect(parseCastFile('[]')).toEqual({ credited: [], claimed: [], revision: null, errors: [] })
    expect(parseCastFile('{"credited": [{"name": "No id"}]}').credited).toEqual([])
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

describe('renderCastFile', () => {
  it('writes nothing at all when there is nobody', () => {
    expect(render([], [])).toBeNull()
  })
})

describe('formatPerson', () => {
  it('does not print an ID twice', () => {
    expect(formatPerson({ name: 'AY-006S', icgId: 'AY-006S' })).toBe('AY-006S')
    expect(formatPerson(anna)).toBe('Anna Y (AY-006S)')
  })
})
