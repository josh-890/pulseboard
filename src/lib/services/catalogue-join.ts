/**
 * Person-catalogue ↔ archive join (ADR-0027, plan slice 0).
 *
 * Pure logic, deliberately separated from the agent that walks the filesystem:
 * this slice exists to produce numbers a design decision rests on, so the parts
 * that compute those numbers have to be testable without a 40k-folder tree.
 *
 * The join key is **exact date + title similarity**. Channel is corroboration
 * and a tiebreaker, never a filter — the two catalogues disagree about channels
 * both cosmetically (`AMOUR ANGELS` vs `AmourAngels`) and substantively (a set
 * filed under where it was published vs where it is kept).
 */

/** One set as recorded by a cover filename in the person catalogue. */
export type CatalogueSet = {
  /** Owning person's ICG-ID, from the `<Name_(ICG-ID)>` folder. */
  icgId: string
  personName: string
  /** ISO `YYYY-MM-DD`; `0000-00-00` in the source means "no usable date". */
  date: string
  channel: string
  externalId: string
  title: string
  isVideo: boolean
}

/** The archive side of the join, as served by the attribution worklist. */
export type ArchiveFolderRow = {
  archiveKey: string
  folderName: string
  parsedDate: string | null
  parsedShortName: string | null
  parsedTitle: string | null
}

/**
 * Cover filename: `YYYY-MM-DD-CHANNEL-EXTID-Title.jpg`.
 * The channel is non-greedy up to the numeric external id, which is what lets
 * channels containing digits or dashes (`VIRTUAGIRL3K`, `X-ART`) parse correctly.
 */
const COVER_RE = /^(\d{4}-\d{2}-\d{2})-(.+?)-(\d+)-(.*)\.jpe?g$/i

/** Person folder: `Common_Name_(ICG-ID)`. */
const PERSON_DIR_RE = /^(.+)_\(([A-Z0-9@-]+)\)$/

export const NO_DATE = '0000-00-00'

export function parsePersonDir(dirName: string): { name: string; icgId: string } | null {
  const m = dirName.match(PERSON_DIR_RE)
  if (!m) return null
  return { name: m[1].replace(/_/g, ' '), icgId: m[2] }
}

export function parseCoverFilename(
  filename: string,
): { date: string; channel: string; externalId: string; title: string } | null {
  const m = filename.match(COVER_RE)
  if (!m) return null
  return { date: m[1], channel: m[2], externalId: m[3], title: m[4] }
}

/**
 * Comparison form for titles. Underscores and dashes become spaces (the
 * catalogue writes `Sky_Light`, the archive `Sky Light`), diacritics are folded,
 * everything else non-alphanumeric is dropped.
 */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sørensen–Dice over character bigrams. 1 = identical, 0 = nothing in common. */
export function titleSimilarity(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0
  const grams = (s: string): Set<string> => {
    const t = s.replace(/ /g, '')
    const out = new Set<string>()
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
    return out
  }
  const A = grams(a)
  const B = grams(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared++
  return (2 * shared) / (A.size + B.size)
}

/** Confidence bands. `exact` is what may ever be auto-suggested without review. */
export const EXACT_THRESHOLD = 0.999
export const STRONG_THRESHOLD = 0.75

export type MatchTier = 'exact' | 'strong' | 'weak' | 'none'

export function tierFor(score: number): MatchTier {
  if (score >= EXACT_THRESHOLD) return 'exact'
  if (score >= STRONG_THRESHOLD) return 'strong'
  if (score >= 0.5) return 'weak'
  return 'none'
}

/** Catalogue sets bucketed by exact date — the outer half of the join key. */
export type CatalogueIndex = Map<string, CatalogueSet[]>

export function buildCatalogueIndex(sets: CatalogueSet[]): CatalogueIndex {
  const index: CatalogueIndex = new Map()
  for (const s of sets) {
    if (s.date === NO_DATE) continue // unusable: the date half of the key is missing
    const bucket = index.get(s.date)
    if (bucket) bucket.push(s)
    else index.set(s.date, [s])
  }
  return index
}

export type FolderMatch = {
  tier: MatchTier
  score: number
  /** Every catalogue set at the winning score. */
  candidates: CatalogueSet[]
  best: CatalogueSet | null
}

/**
 * Ambiguity that matters is **more than one distinct person** at the winning
 * score. Several candidates naming the SAME person are not a decision the
 * operator has to make: the catalogue routinely lists one set twice — once as a
 * photoset and once as a video, or under two spellings of its channel
 * (`FEMJOY` / `FEMJOY ARCHIVES`). Counting those as ambiguous overstates the
 * precision risk, which is the number the ADR-0027 decision gate turns on.
 */
export function distinctPersons(match: FolderMatch): number {
  return new Set(match.candidates.map((c) => c.icgId)).size
}

export function isAmbiguous(match: FolderMatch): boolean {
  return distinctPersons(match) > 1
}

/**
 * Does the folder name announce more than one participant?
 *
 * `FJ Michelle & Rebecca - Angels` matching two catalogue rows is not an
 * ambiguity — it is both participants being found. Counting those as ambiguous
 * turns the design's best behaviour into evidence against it, which matters
 * because that figure drives the ADR-0027 decision gate.
 */
export function aliasTokenLooksMulti(aliasToken: string | null): boolean {
  if (!aliasToken) return false
  return /\s(&|and|\+)\s|,/i.test(aliasToken)
}

/** Ambiguity worth reviewing: several persons where the folder names only one. */
export function isUnexplainedAmbiguity(match: FolderMatch, aliasToken: string | null): boolean {
  return isAmbiguous(match) && !aliasTokenLooksMulti(aliasToken)
}

/**
 * Match one archive folder against the catalogue.
 *
 * Ties are broken by channel when possible — the only role channel plays. If a
 * tie survives that, the ambiguity is reported rather than guessed: two folders
 * sharing a date and title are either two different people (distinguishable by
 * the folder's alias token, which the caller has) or one set published twice.
 */
export function matchFolder(
  folder: ArchiveFolderRow,
  index: CatalogueIndex,
): FolderMatch {
  const none: FolderMatch = { tier: 'none', score: 0, candidates: [], best: null }
  if (!folder.parsedDate) return none
  const bucket = index.get(folder.parsedDate)
  if (!bucket || bucket.length === 0) return none

  const folderTitle = normalizeTitle(folder.parsedTitle ?? folder.folderName)
  if (!folderTitle) return none

  let best = 0
  let winners: CatalogueSet[] = []
  for (const cand of bucket) {
    const score = titleSimilarity(folderTitle, normalizeTitle(cand.title))
    if (score > best + 1e-9) {
      best = score
      winners = [cand]
    } else if (Math.abs(score - best) <= 1e-9) {
      winners.push(cand)
    }
  }

  const tier = tierFor(best)
  if (tier === 'none') return none

  // Channel as tiebreaker only.
  if (winners.length > 1 && folder.parsedShortName) {
    const short = folder.parsedShortName.toLowerCase()
    const byChannel = winners.filter((w) => channelLooselyMatches(w.channel, short))
    if (byChannel.length === 1) return { tier, score: best, candidates: winners, best: byChannel[0] }
  }

  return { tier, score: best, candidates: winners, best: winners[0] }
}

/**
 * Does a catalogue channel name plausibly denote the archive's short code?
 * Intentionally loose — this only ever breaks ties, so a false negative costs an
 * unresolved ambiguity rather than a wrong answer.
 */
export function channelLooselyMatches(catalogueChannel: string, archiveShortName: string): boolean {
  const cat = catalogueChannel.toLowerCase().replace(/[^a-z0-9]/g, '')
  const short = archiveShortName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!cat || !short) return false
  if (cat === short || cat.startsWith(short)) return true

  // Short codes are abbreviations, not initials: WATCH4BEAUTY -> W4B,
  // FEMJOY -> FJ, LETSDOEIT -> LDI. What they have in common is being a
  // SUBSEQUENCE of the full name, so that is the test. Loose on purpose — this
  // only ever breaks a tie between candidates that already agree on date and
  // title, so a false positive costs far less than an unresolved ambiguity.
  let i = 0
  for (const ch of cat) {
    if (ch === short[i]) i++
    if (i === short.length) return true
  }
  return false
}

/** Grouping key for the confirmation unit: (channel short name, alias token). */
export function groupKey(shortName: string | null, aliasToken: string | null): string {
  return `${(shortName ?? '?').toUpperCase()}|${normalizeTitle(aliasToken ?? '')}`
}
