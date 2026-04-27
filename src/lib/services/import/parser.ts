/**
 * Parser for structured person data files.
 *
 * File format: key-value pairs with sections for person profile,
 * digital identities, channel appearances, photo/video sets, and co-models.
 * Source: thenude.com extraction via PowerShell script.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ParsedPersonData = {
  sourceUrl: string
  name: string
  slug: string
  icgId: string
  aliases: string[]
  birthMonth: string | null
  birthYear: string | null
  nationality: string | null
  activeFromYear: string | null
  retiredYear: string | null
  isStillActive: boolean
  measurements: string | null
  heightCm: number | null
  heightFtIn: string | null
  breastDescription: string | null
  hairColor: string | null
  tattoos: string | null
  activities: string | null
  biography: string | null
  biographies: string | null
}

export type ParsedDigitalIdentity = {
  platform: string
  url: string
}

export type ParsedChannelAppearance = {
  channelName: string
  aliasOnChannel: string
}

export type ParsedModelRef = {
  name: string
  icgId: string
  url: string
}

export type ParsedSet = {
  longTitle: string
  title: string
  externalId: string
  titleUrl: string
  channelName: string
  artist: string | null
  coverImageUrl: string | null
  coverImageAlt: string | null
  date: string | null
  suggestedDate: string | null  // YYYY-MM-DD extracted from title when Date=0000-00-00
  description: string | null
  imageCount: number | null
  isVideo: boolean
  modelsCount: number
  modelsList: ParsedModelRef[]
}

export type ParsedCoModel = {
  name: string
  icgId: string
  url: string
  thumbUrl: string | null
}

export type ParsedImportData = {
  person: ParsedPersonData
  digitalIdentities: ParsedDigitalIdentity[]
  channelAppearances: ParsedChannelAppearance[]
  sets: ParsedSet[]
  coModels: ParsedCoModel[]
}

export type FilenameMetadata = {
  extractionDate: string | null // YYYY-MM-DD
  name: string | null
  icgId: string | null
}

// ─── Filename Parser ────────────────────────────────────────────────────────

export function parseFilename(filename: string): FilenameMetadata {
  // Format: YYYY-MM-DD_Name_(ICG-ID)
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})_(.+?)_\((.+?)\)$/)
  if (!match) {
    return { extractionDate: null, name: null, icgId: null }
  }
  return {
    extractionDate: match[1],
    name: match[2],
    icgId: match[3],
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function trimValue(line: string, _key?: string): string {
  // Handle both "Key : value" and "Key     : value" formats
  const idx = line.indexOf(':')
  if (idx === -1) return ''
  return line.slice(idx + 1).trim()
}

function isEmptyValue(val: string): boolean {
  return !val || val === '—' || val === '-' || val === 'N/A' || val === 'n/a'
}

const HAIR_COLOR_NORMALIZE: Record<string, string> = {
  'fair': 'Blonde',
  'light': 'Light Brown',
  'dark': 'Dark Brown',
  'raven': 'Black',
  'sandy': 'Strawberry Blonde',
  'ginger': 'Red',
  'chestnut': 'Auburn',
  'honey': 'Blonde',
  'jet black': 'Black',
  'dirty blonde': 'Light Brown',
}

function normalizeHairColor(raw: string): string {
  return HAIR_COLOR_NORMALIZE[raw.toLowerCase()] ?? raw
}

function parseHeight(raw: string): { cm: number | null; ftIn: string | null } {
  // Format: "168 cm, 5 ft 6 in" or just "168 cm"
  const cmMatch = raw.match(/(\d+)\s*cm/)
  const ftInMatch = raw.match(/(\d+\s*ft\s*\d+\s*in)/)
  return {
    cm: cmMatch ? parseInt(cmMatch[1], 10) : null,
    ftIn: ftInMatch ? ftInMatch[1] : null,
  }
}

function parseBorn(raw: string): { month: string | null; year: string | null } {
  // Format: "March 1982" or "1982" or empty
  if (isEmptyValue(raw)) return { month: null, year: null }
  const parts = raw.trim().split(/\s+/)
  if (parts.length >= 2) {
    return { month: parts[0], year: parts[parts.length - 1] }
  }
  if (parts.length === 1 && /^\d{4}$/.test(parts[0])) {
    return { month: null, year: parts[0] }
  }
  return { month: null, year: null }
}

function parseModelsList(raw: string): ParsedModelRef[] {
  // Format: "Name_(ICG-ID)[URL], Name_(ICG-ID)[URL], ..."
  if (isEmptyValue(raw)) return []
  const results: ParsedModelRef[] = []
  // Split on ", " but be careful with URLs that contain commas
  const pattern = /([^,\[]+?)_\(([^)]+)\)\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    results.push({
      name: match[1].trim().replace(/_/g, ' '),
      icgId: match[2].trim(),
      url: match[3].trim(),
    })
  }
  return results
}

// ─── Main Parser ────────────────────────────────────────────────────────────

type Section = 'header' | 'links' | 'channels' | 'sets' | 'comodels'

export function parseImportFile(content: string): ParsedImportData {
  const lines = content.split('\n')

  const person: ParsedPersonData = {
    sourceUrl: '',
    name: '',
    slug: '',
    icgId: '',
    aliases: [],
    birthMonth: null,
    birthYear: null,
    nationality: null,
    activeFromYear: null,
    retiredYear: null,
    isStillActive: false,
    measurements: null,
    heightCm: null,
    heightFtIn: null,
    breastDescription: null,
    hairColor: null,
    tattoos: null,
    activities: null,
    biography: null,
    biographies: null,
  }
  const digitalIdentities: ParsedDigitalIdentity[] = []
  const channelAppearances: ParsedChannelAppearance[] = []
  const sets: ParsedSet[] = []
  const coModels: ParsedCoModel[] = []

  let section: Section = 'header'
  let i = 0

  // ── Parse Header Section ──────────────────────────────────────────────
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith("=== Links aus 'Other Links' ===")) {
      section = 'links'
      i++
      break
    }

    if (trimmed.startsWith('URL:')) {
      person.sourceUrl = trimValue(line, 'URL')
    } else if (trimmed.startsWith('Name (extrahiert):')) {
      person.name = line.slice(line.indexOf(':') + 1).trim()
    } else if (trimmed.startsWith('Slug:')) {
      person.slug = trimValue(line, 'Slug')
    } else if (trimmed.startsWith('ICGID')) {
      person.icgId = trimValue(line, 'ICGID')
    } else if (trimmed.startsWith('AKA')) {
      const akaStr = trimValue(line, 'AKA')
      if (!isEmptyValue(akaStr)) {
        person.aliases = akaStr.split(',').map((a) => a.trim()).filter(Boolean)
      }
    } else if (trimmed.startsWith('Born')) {
      const born = parseBorn(trimValue(line, 'Born'))
      person.birthMonth = born.month
      person.birthYear = born.year
    } else if (trimmed.startsWith('Birthplace')) {
      const val = trimValue(line, 'Birthplace')
      person.nationality = isEmptyValue(val) ? null : val
    } else if (trimmed.startsWith('First Seen')) {
      const val = trimValue(line, 'First Seen')
      person.activeFromYear = isEmptyValue(val) ? null : val
    } else if (trimmed.startsWith('Measurements')) {
      const val = trimValue(line, 'Measurements')
      person.measurements = isEmptyValue(val) ? null : val
    } else if (trimmed.startsWith('Height')) {
      const val = trimValue(line, 'Height')
      if (!isEmptyValue(val)) {
        const h = parseHeight(val)
        person.heightCm = h.cm
        person.heightFtIn = h.ftIn
      }
    } else if (trimmed.startsWith('Breasts')) {
      const val = trimValue(line, 'Breasts')
      person.breastDescription = isEmptyValue(val) ? null : val
    } else if (trimmed.startsWith('Hair Colour')) {
      const val = trimValue(line, 'Hair Colour')
      person.hairColor = isEmptyValue(val) ? null : normalizeHairColor(val)
    } else if (trimmed.startsWith('Tattoos')) {
      const val = trimValue(line, 'Tattoos')
      person.tattoos = isEmptyValue(val) ? null : val
    } else if (trimmed.startsWith('Activities')) {
      const val = trimValue(line, 'Activities')
      person.activities = isEmptyValue(val) ? null : val
    } else if (trimmed.startsWith('Biographies')) {
      // Multiline biography block — collect lines until blank line or === section
      const bioLines: string[] = []
      const firstLine = trimValue(line, 'Biographies')
      if (firstLine.startsWith('<')) {
        // Angle-bracket delimited format: read until closing >
        const afterOpen = firstLine.slice(1).trim()
        if (afterOpen) bioLines.push(afterOpen)
        i++
        while (i < lines.length) {
          const bioLine = lines[i]
          if (bioLine.trim().endsWith('>')) {
            const before = bioLine.trim().slice(0, -1).trim()
            if (before) bioLines.push(before)
            break
          }
          bioLines.push(bioLine)
          i++
        }
      } else if (!isEmptyValue(firstLine)) {
        // Plain text format: first line has content, continue until blank or === marker
        bioLines.push(firstLine)
        i++
        while (i < lines.length) {
          const bioLine = lines[i]
          if (bioLine.trim() === '' || bioLine.trim().startsWith('===')) {
            i-- // back up so outer loop processes this line
            break
          }
          bioLines.push(bioLine.trim())
          i++
        }
      }
      if (bioLines.length > 0) {
        const bioText = bioLines.join('\n').trim()
        person.biographies = bioText || person.biographies
        // Extract retirement/active status from biographies text
        const retiredMatch = bioText.match(/retired in (\d{4})/i)
        if (retiredMatch) {
          person.retiredYear = retiredMatch[1]
        }
        if (/still active/i.test(bioText)) {
          person.isStillActive = true
        }
      }
    } else if (trimmed.startsWith('Biography')) {
      const val = trimValue(line, 'Biography')
      person.biography = isEmptyValue(val) ? null : val
    }

    i++
  }

  // ── Parse Digital Identities (Other Links) ────────────────────────────
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect transition to channel appearances
    if (/^Channel\s*:/.test(trimmed)) {
      section = 'channels'
      break
    }

    // Detect transition to sets (skip channels if none)
    if (/^Titeltxt\s*:/.test(trimmed)) {
      section = 'sets'
      break
    }

    // Parse identity: "PLATFORM : URL" followed by "   Text: PLATFORM"
    if (trimmed && !trimmed.startsWith('Text:') && trimmed.includes(' : ')) {
      const colonIdx = trimmed.indexOf(' : ')
      const platform = trimmed.slice(0, colonIdx).trim()
      const url = trimmed.slice(colonIdx + 3).trim()
      if (url.startsWith('http')) {
        digitalIdentities.push({ platform, url })
      }
    }

    i++
  }

  // ── Parse Channel Appearances ─────────────────────────────────────────
  if (section === 'channels') {
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // Detect transition to sets
      if (/^Titeltxt\s*:/.test(trimmed)) {
        section = 'sets'
        break
      }

      if (/^Channel\s*:/.test(trimmed)) {
        const channelName = trimValue(line, 'Channel')
        // Next non-empty line should be "Name    : ALIAS"
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j++
        if (j < lines.length && /^Name\s*:/.test(lines[j].trim())) {
          const aliasOnChannel = trimValue(lines[j], 'Name')
          channelAppearances.push({ channelName, aliasOnChannel })
          i = j + 1
          continue
        }
      }

      i++
    }
  }

  // ── Parse Sets (Photo + Video) ────────────────────────────────────────
  if (section === 'sets') {
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // Detect transition to co-models: "Name  : VALUE" after blank lines
      if (/^Name\s+:/.test(trimmed) && !trimmed.startsWith('Name (')) {
        // Look ahead to confirm it's a co-model block (has ID on next line)
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j++
        if (j < lines.length && /^ID\s*:/.test(lines[j].trim())) {
          section = 'comodels'
          break
        }
      }

      if (/^Titeltxt\s*:/.test(trimmed)) {
        const currentSet: ParsedSet = {
          longTitle: '',
          title: '',
          externalId: '',
          titleUrl: '',
          channelName: '',
          artist: null,
          coverImageUrl: null,
          coverImageAlt: null,
          date: null,
          suggestedDate: null,
          description: null,
          imageCount: null,
          isVideo: false,
          modelsCount: 0,
          modelsList: [],
        }

        currentSet.longTitle = trimValue(line, 'Titeltxt')

        // Read the rest of the set block
        i++
        while (i < lines.length) {
          const sLine = lines[i]
          const sTrimmed = sLine.trim()

          // End of set block: empty line or next Titeltxt or co-model section
          if (!sTrimmed) {
            i++
            break
          }
          if (/^Titeltxt\s*:/.test(sTrimmed)) break
          if (/^Name\s+:/.test(sTrimmed) && !sTrimmed.startsWith('Name (')) {
            break
          }

          if (/^Covertitle\s*:/.test(sTrimmed)) {
            currentSet.title = trimValue(sLine, 'Covertitle')
          } else if (/^CoverId\s*:/.test(sTrimmed)) {
            currentSet.externalId = trimValue(sLine, 'CoverId')
          } else if (/^TitleURL\s*:/.test(sTrimmed)) {
            currentSet.titleUrl = trimValue(sLine, 'TitleURL')
          } else if (/^Channel\s*:/.test(sTrimmed)) {
            currentSet.channelName = trimValue(sLine, 'Channel')
          } else if (/^Artist\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Artist')
            currentSet.artist = isEmptyValue(val) ? null : val
          } else if (/^Coverimg\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Coverimg')
            currentSet.coverImageUrl = isEmptyValue(val) ? null : val
          } else if (/^Alttext\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Alttext')
            currentSet.coverImageAlt = isEmptyValue(val) ? null : val
          } else if (/^Date\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Date')
            const rawDate = isEmptyValue(val) ? null : val
            currentSet.date = (rawDate === '0000-00-00' || !rawDate) ? null : rawDate
          } else if (/^Description\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Description')
            currentSet.description = isEmptyValue(val) ? null : val
          } else if (/^Imagenumber\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Imagenumber')
            const n = parseInt(val, 10)
            currentSet.imageCount = isNaN(n) ? null : n
          } else if (/^Video\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'Video').toLowerCase()
            currentSet.isVideo = val === 'true'
          } else if (/^Type\s*:/.test(sTrimmed)) {
            // Redundant with Video field, but confirms video type
            const val = trimValue(sLine, 'Type').toLowerCase()
            if (val === 'video') currentSet.isVideo = true
          } else if (/^ModelsCount\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'ModelsCount')
            currentSet.modelsCount = parseInt(val, 10) || 0
          } else if (/^ModelsList\s*:/.test(sTrimmed)) {
            const val = trimValue(sLine, 'ModelsList')
            currentSet.modelsList = parseModelsList(val)
          }
          // Skip: ModelsShort (buggy), Models (PowerShell artifact)

          i++
        }

        // If no date, try to extract [YYYY-MM-DD] from the title
        if (!currentSet.date) {
          const m = currentSet.title.match(/\[(\d{4}-\d{2}-\d{2})\]/)
          currentSet.suggestedDate = m ? m[1] : null
        }

        sets.push(currentSet)
        continue
      }

      i++
    }
  }

  // ── Parse Co-Models ───────────────────────────────────────────────────
  if (section === 'comodels') {
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (/^Name\s+:/.test(trimmed)) {
        const coModel: ParsedCoModel = {
          name: trimValue(line, 'Name'),
          icgId: '',
          url: '',
          thumbUrl: null,
        }

        i++
        while (i < lines.length) {
          const cLine = lines[i]
          const cTrimmed = cLine.trim()

          if (!cTrimmed) {
            i++
            break
          }

          if (/^ID\s*:/.test(cTrimmed)) {
            coModel.icgId = trimValue(cLine, 'ID')
          } else if (/^URL\s*:/.test(cTrimmed)) {
            coModel.url = trimValue(cLine, 'URL')
          } else if (/^Thumb\s*:/.test(cTrimmed)) {
            const val = trimValue(cLine, 'Thumb')
            coModel.thumbUrl = isEmptyValue(val) ? null : val
          }

          i++
        }

        if (coModel.icgId) {
          coModels.push(coModel)
        }
        continue
      }

      i++
    }
  }

  return {
    person,
    digitalIdentities,
    channelAppearances,
    sets,
    coModels,
  }
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

export type DuplicateGroup = {
  key: string // "title|date"
  setIndices: number[]
}

export function detectPotentialDuplicates(sets: ParsedSet[]): DuplicateGroup[] {
  const groups = new Map<string, number[]>()

  sets.forEach((set, idx) => {
    const key = `${set.title.toLowerCase()}|${set.date || ''}`
    const existing = groups.get(key)
    if (existing) {
      existing.push(idx)
    } else {
      groups.set(key, [idx])
    }
  })

  return Array.from(groups.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([key, setIndices]) => ({ key, setIndices }))
}

// ─── Unique Entity Extraction ───────────────────────────────────────────────

export function extractUniqueChannels(
  data: ParsedImportData,
): string[] {
  const channels = new Set<string>()
  for (const ca of data.channelAppearances) {
    channels.add(ca.channelName.toUpperCase())
  }
  for (const set of data.sets) {
    channels.add(set.channelName.toUpperCase())
  }
  return Array.from(channels).sort()
}

export function extractUniqueCoModels(
  data: ParsedImportData,
): ParsedCoModel[] {
  const seen = new Map<string, ParsedCoModel>()

  // From co-models section (has thumbUrl)
  for (const cm of data.coModels) {
    seen.set(cm.icgId, cm)
  }

  // From set modelsList (may add new ones not in co-model section)
  for (const set of data.sets) {
    for (const model of set.modelsList) {
      // Skip the subject person themselves
      if (model.icgId === data.person.icgId) continue
      if (!seen.has(model.icgId)) {
        seen.set(model.icgId, {
          name: model.name,
          icgId: model.icgId,
          url: model.url,
          thumbUrl: null,
        })
      }
    }
  }

  return Array.from(seen.values())
}
