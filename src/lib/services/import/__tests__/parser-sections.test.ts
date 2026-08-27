import { describe, expect, it } from 'vitest'
import { parseImportFile } from '../parser'

// Where the header ends.
//
// `parseImportFile` is a single forward pass over the file with one cursor, so every
// section after the header can only be found if the header hands the cursor over at
// the right line. For a year that hand-off had exactly one trigger: the
// `=== Links aus 'Other Links' ===` marker. That section is optional — the extractor
// writes it only for a model with external links — and the first file to arrive
// without one (Hilary C, AX-00ET, 8,057 lines) ran the header loop to EOF. Every
// later section then parsed against an exhausted cursor and returned nothing: 454
// sets, 31 channel appearances and 27 co-models became zero, and the batch was
// created, marked REVIEW and shown as a normal import holding two items.
//
// These fixtures are the real file's shape in miniature. CRLF on purpose: the source
// files are written on Windows, and `trim()` is the only reason that works.

const HEADER = [
  'URL: https://www.thenude.com/Hilary%20C_24608.htm',
  'Name (extrahiert): Hilary C',
  'Slug: Hilary%20C_24608',
  '',
  'ICGID       : AX-00ET',
  'AKA         : Amy, Jenna, Kseniya',
  'Born        : June 1994',
  'Height      : 163 cm, 5 ft 4 in',
  'Biography   : She has 454 covers, 368 photosets and 86 videos to her name.',
  'Biographies : AMOUR ANGELS biography: A real Ukrainian beauty.',
  "She's still active",
]

const CHANNELS = [
  '',
  'Channel : ALEX-LYNN',
  'Name    : Hilary & HIlary',
  '',
  'Channel : AMOUR ANGELS',
  'Name    : Kseniya',
]

const SETS = [
  '',
  'Titeltxt    : Jenna in Velvet Season gallery from MPLSTUDIOS',
  'Covertitle  : Velvet Season',
  'CoverId     : 187964',
  'TitleURL    : https://www.thenude.com/cover/mplstudios/187964/jenna-in-velvet-season',
  'Channel     : MPLSTUDIOS',
  'Artist      : Aztek Santiago',
  'Date        : 2012-10-01',
  'Imagenumber : 74',
  'Video       : False',
  'ModelsCount : 1',
  'ModelsList  : Hilary C_(AX-00ET)[https://www.thenude.com/Hilary C_24608.htm]',
]

const COMODELS = [
  '',
  'Name  : Milena D',
  'ID    : MD-914E',
  'URL   : https://www.thenude.com/Milena D_15225.htm',
  'Thumb : https://static.thenude.com/models/Milena D_15225/starthumb.jpg',
  '',
]

const LINKS = [
  '',
  "=== Links aus 'Other Links' ===",
  'FREEONES : http://www.freeones.com/html/a_links/bio_Hilary.php',
  '   Text: FREEONES',
]

const build = (...blocks: string[][]): string =>
  blocks.flat().join('\r\n')

describe('parseImportFile — section hand-off', () => {
  it('reads every section when the file has no "Other Links" marker', () => {
    const parsed = parseImportFile(build(HEADER, CHANNELS, SETS, COMODELS))

    expect(parsed.person.icgId).toBe('AX-00ET')
    expect(parsed.person.heightCm).toBe(163)
    // The failure was total, so the assertions that matter are the non-zero ones.
    expect(parsed.channelAppearances).toHaveLength(3) // "Hilary & HIlary" is two
    expect(parsed.sets).toHaveLength(1)
    expect(parsed.sets[0].externalId).toBe('187964')
    expect(parsed.sets[0].channelName).toBe('MPLSTUDIOS')
    expect(parsed.coModels).toHaveLength(1)
    expect(parsed.digitalIdentities).toHaveLength(0)
  })

  it('still reads every section when the marker is present', () => {
    const parsed = parseImportFile(build(HEADER, LINKS, CHANNELS, SETS, COMODELS))

    expect(parsed.digitalIdentities).toEqual([
      { platform: 'FREEONES', url: 'http://www.freeones.com/html/a_links/bio_Hilary.php' },
    ])
    expect(parsed.channelAppearances).toHaveLength(3)
    expect(parsed.sets).toHaveLength(1)
    expect(parsed.coModels).toHaveLength(1)
  })

  // A model with no links *and* no channel appearances: the sets have to be found
  // straight off the header, which is the other half of the same hand-off.
  it('reads sets when neither links nor channel appearances are present', () => {
    const parsed = parseImportFile(build(HEADER, SETS, COMODELS))

    expect(parsed.channelAppearances).toHaveLength(0)
    expect(parsed.sets).toHaveLength(1)
    expect(parsed.coModels).toHaveLength(1)
  })

  // The header keeps reading its own keys up to the hand-off; a section line must
  // not be mistaken for one, and the multi-line Biographies block must not swallow
  // the section that follows it.
  it('keeps the header intact up to the hand-off', () => {
    const parsed = parseImportFile(build(HEADER, CHANNELS, SETS))

    expect(parsed.person.name).toBe('Hilary C')
    expect(parsed.person.aliases).toEqual(['Amy', 'Jenna', 'Kseniya'])
    expect(parsed.person.birthYear).toBe('1994')
    expect(parsed.person.birthMonth).toBe('June')
    expect(parsed.person.isStillActive).toBe(true)
    expect(parsed.person.biographies).toContain('Ukrainian beauty')
    expect(parsed.person.biographies).not.toContain('ALEX-LYNN')
  })
})
