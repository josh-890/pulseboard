import { describe, expect, it } from 'vitest'
import {
  checkParseCoverage,
  countRawSectionSignals,
  describeShortfalls,
  parseImportFile,
} from '../parser'

// Does the file contain something the parser did not read?
//
// The guard exists because a truncating parse is indistinguishable from a thin
// file once the parse is over: two ImportItems is a plausible result for a new
// model and a catastrophe for an established one, and nothing downstream could
// tell the two apart. So the check is made against the *raw text*, before the
// parser's answer is trusted.
//
// The risk it carries is the opposite one. A signal counted more loosely than the
// parser matches would report shortfalls on files that are perfectly fine, and a
// guard that cries wolf is worse than the silence it replaced — it would train the
// operator to click past the one time it is right. Hence the false-positive tests
// below: they matter more than the true-positive one.

const HEADER = [
  'URL: https://www.thenude.com/Hilary%20C_24608.htm',
  'Name (extrahiert): Hilary C',
  'ICGID       : AX-00ET',
  'AKA         : Amy, Jenna',
  'Height      : 163 cm, 5 ft 4 in',
]

const CHANNELS = ['', 'Channel : ALEX-LYNN', 'Name    : Hilary']

const SET_BLOCK = [
  '',
  'Titeltxt    : Jenna in Velvet Season gallery from MPLSTUDIOS',
  'Covertitle  : Velvet Season',
  'CoverId     : 187964',
  'Channel     : MPLSTUDIOS',
  'Artist      : Aztek Santiago',
  'Date        : 2012-10-01',
  'Imagenumber : 74',
  'Video       : False',
  'ModelsCount : 1',
  'ModelsList  : Hilary C_(AX-00ET)[https://www.thenude.com/Hilary C_24608.htm]',
]

const COMODEL = [
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

const build = (...blocks: string[][]): string => blocks.flat().join('\r\n')

describe('countRawSectionSignals', () => {
  it('counts only the block shapes the parser keys on', () => {
    const raw = countRawSectionSignals(build(HEADER, LINKS, CHANNELS, SET_BLOCK, COMODEL))
    expect(raw).toEqual({
      sets: 1,
      channelAppearances: 1,
      coModels: 1,
      digitalIdentities: 1,
    })
  })

  // A set block carries its own "Channel :" line, answered by Artist — never by
  // Name. If that inflated the channel count, every file would report a shortfall
  // the moment its channel section was legitimately absent.
  it('does not count a set block\'s Channel line as a channel appearance', () => {
    const raw = countRawSectionSignals(build(HEADER, SET_BLOCK, SET_BLOCK))
    expect(raw.sets).toBe(2)
    expect(raw.channelAppearances).toBe(0)
  })

  // "Name    : Kseniya" in the channel section and "Name  : Milena D" in the
  // co-model section are the same shape; only the following line tells them apart.
  it('separates a channel appearance from a co-model by its answering line', () => {
    const raw = countRawSectionSignals(build(HEADER, CHANNELS, COMODEL))
    expect(raw.channelAppearances).toBe(1)
    expect(raw.coModels).toBe(1)
  })

  it('does not read the header\'s "Name (extrahiert)" as a block', () => {
    expect(countRawSectionSignals(build(HEADER)).coModels).toBe(0)
    expect(countRawSectionSignals(build(HEADER)).channelAppearances).toBe(0)
  })

  // A link line the parser would rightly drop is not evidence of a failed parse.
  it('counts only link lines carrying a URL the parser accepts', () => {
    const malformed = build(HEADER, [
      '',
      "=== Links aus 'Other Links' ===",
      'SOMEPLACE : www.example.com/no-scheme',
      '   Text: SOMEPLACE',
    ])
    expect(countRawSectionSignals(malformed).digitalIdentities).toBe(0)
    expect(checkParseCoverage(malformed, parseImportFile(malformed))).toEqual([])
  })

  it('counts identity links only inside the Other Links region', () => {
    // The co-model block's "URL : https://…" sits outside the region and must not
    // be mistaken for an external link.
    const raw = countRawSectionSignals(build(HEADER, CHANNELS, SET_BLOCK, COMODEL))
    expect(raw.digitalIdentities).toBe(0)
  })
})

describe('checkParseCoverage', () => {
  it('reports nothing when the parser read the whole file', () => {
    const content = build(HEADER, LINKS, CHANNELS, SET_BLOCK, COMODEL)
    expect(checkParseCoverage(content, parseImportFile(content))).toEqual([])
  })

  it('reports nothing for a file that genuinely has no sections', () => {
    const content = build(HEADER)
    expect(checkParseCoverage(content, parseImportFile(content))).toEqual([])
  })

  // The Hilary C shape: the parser returns a clean header and nothing else.
  it('names every section the file holds that came out empty', () => {
    const content = build(HEADER, CHANNELS, SET_BLOCK, COMODEL)
    const truncated = {
      ...parseImportFile(content),
      sets: [],
      channelAppearances: [],
      coModels: [],
    }

    const shortfalls = checkParseCoverage(content, truncated)

    expect(shortfalls).toEqual([
      { kind: 'section', section: 'sets', label: 'set blocks', found: 1 },
      { kind: 'section', section: 'channelAppearances', label: 'channel appearances', found: 1 },
      { kind: 'section', section: 'coModels', label: 'co-models', found: 1 },
    ])
  })

  it('counts singular and plural correctly in the message', () => {
    expect(
      describeShortfalls([{ kind: 'section', section: 'coModels', label: 'co-models', found: 1 }]),
    ).toContain('1 co-model found')
    expect(
      describeShortfalls([{ kind: 'section', section: 'sets', label: 'set blocks', found: 454 }]),
    ).toContain('454 set blocks found')
  })

  // Partial is a data question, not a parser failure — it belongs in review.
  it('stays quiet when a section parsed partially', () => {
    const content = build(HEADER, SET_BLOCK, SET_BLOCK, SET_BLOCK)
    const partial = { ...parseImportFile(content), sets: [parseImportFile(content).sets[0]] }
    expect(checkParseCoverage(content, partial)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The Matilda Bae shape (MB-003G, xpulse, 2026-09-15).
//
// The header has no terminator of its own — the loop runs to the "Other Links"
// marker or the first `Channel :` / `Titeltxt :`. When the scrape fails to strip
// tags at `Biography :`, the rest of the page lands ahead of those, and every
// gallery credit on thenude.com is an anchor whose title attribute carries a
// newline:
//
//     <a href="…" title="Matilda Bae
//     ICGID: MB-003G" class="model-title">Matilda Bae</a>
//
// The second physical line starts with ICGID. With plain assignment the last of
// 93 such lines won, so 111 staged sets were filed under an ICG-ID with HTML
// welded to it, none resolved to a person, and the cover basket matched nothing.
// 4 of 164 xpulse files carry this shape.

const POLLUTED_CREDIT = [
  '                        <a href="https://www.thenude.com/Matilda Bae_29205.htm" title="Matilda Bae',
  'ICGID: MB-003G" class="model-title">Matilda Bae</a>',
  '                        <div class="model-name">as Magdalena</div>',
]

const CLEAN_HEADER = [
  'URL: https://www.thenude.com/Matilda%20Bae_29205.htm',
  'Name (extrahiert): Matilda Bae',
  'ICGID       : MB-003G',
  'AKA         : Julietta, Magdalena',
  'Height      : 160 cm, 5 ft 3 in',
  'Biography   : Julietta or Magdalena?    </p>',
]

describe('header keys are single-valued', () => {
  it('keeps the real ICG-ID when the HTML spill repeats the key', () => {
    const content = build(CLEAN_HEADER, POLLUTED_CREDIT, CHANNELS, SET_BLOCK)
    expect(parseImportFile(content).person.icgId).toBe('MB-003G')
  })

  it('survives the key repeating many times, as the real files do', () => {
    const content = build(
      CLEAN_HEADER,
      ...Array.from({ length: 92 }, () => POLLUTED_CREDIT),
      CHANNELS,
      SET_BLOCK,
    )
    expect(parseImportFile(content).person.icgId).toBe('MB-003G')
  })

  it('protects every other header field too, not just ICGID', () => {
    const content = build(CLEAN_HEADER, [
      'URL: https://evil.example/overwritten',
      'Name (extrahiert): Overwritten',
      'AKA         : Overwritten',
      'Height      : 999 cm, 9 ft 9 in',
    ])
    const { person } = parseImportFile(content)
    expect(person.sourceUrl).toBe('https://www.thenude.com/Matilda%20Bae_29205.htm')
    expect(person.name).toBe('Matilda Bae')
    expect(person.aliases).toEqual(['Julietta', 'Magdalena'])
    expect(person.heightCm).toBe(160)
  })

  it('still reads a normal file exactly as before', () => {
    const content = build(HEADER, LINKS, CHANNELS, SET_BLOCK, COMODEL)
    const { person, sets, channelAppearances, coModels } = parseImportFile(content)
    expect(person.icgId).toBe('AX-00ET')
    expect(person.name).toBe('Hilary C')
    expect(person.aliases).toEqual(['Amy', 'Jenna'])
    expect(sets).toHaveLength(1)
    expect(channelAppearances).toHaveLength(1)
    expect(coModels).toHaveLength(1)
  })
})

describe('malformed ICG-ID', () => {
  it('is reported when the parser read something that is not an ICG-ID', () => {
    const parsed = parseImportFile(build(CLEAN_HEADER))
    const polluted = {
      ...parsed,
      person: { ...parsed.person, icgId: 'MB-003G" class="model-title">Matilda Bae</a>' },
    }
    expect(checkParseCoverage(build(CLEAN_HEADER), polluted)).toEqual([
      { kind: 'malformedIcgId', value: 'MB-003G" class="model-title">Matilda Bae</a>' },
    ])
  })

  it('says what is wrong and what to do about it', () => {
    const message = describeShortfalls([{ kind: 'malformedIcgId', value: 'MB-003G"><a>' }])
    expect(message).toContain('MB-003G"><a>')
    expect(message).toContain('Change ICG-ID')
  })

  it('stays quiet for both ICG-ID namespaces', () => {
    for (const icgId of ['MB-003G', 'AX-00ET', 'CR-00KI7', 'JD-95@K7R']) {
      const parsed = parseImportFile(build(CLEAN_HEADER))
      const withId = { ...parsed, person: { ...parsed.person, icgId } }
      expect(checkParseCoverage(build(CLEAN_HEADER), withId)).toEqual([])
    }
  })

  it('stays quiet when the file carries no ICG-ID at all', () => {
    const noId = build([
      'URL: https://www.thenude.com/x.htm',
      'Name (extrahiert): No Id',
    ])
    expect(checkParseCoverage(noId, parseImportFile(noId))).toEqual([])
  })
})
