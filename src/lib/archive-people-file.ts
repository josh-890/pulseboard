/**
 * What the archive says about who is in a set (ADR-0029, ADR-0030).
 *
 * Everything tool-written lives in a `.pulseboard\` directory inside the set folder,
 * so the media plane holds only media — the separation BagIt and OCFL make between
 * payload and metadata, as far as it can be had without restructuring 34k paths:
 *
 *   `.pulseboard/pulseboard.json`  the identity anchor, written once
 *   `.pulseboard/cast.json`        this file: a generated mirror of what the app knows
 *   `.pulseboard/Iveta_C_(IC-87VY)` a marker — your own claim, the name IS the payload
 *
 * The generated file is JSON because it is machine-written and machine-read: the app
 * renders it and the agent writes the body verbatim, so PowerShell's one-element
 * array collapse never touches it (that hazard lives in the ingest payload, which
 * `coerceFolderPeople` guards). Authoring happens through marker files instead —
 * copying a file into twelve folders is one gesture, editing twelve files is not,
 * and two markers in one folder need no merging.
 *
 * Every entry is self-contained: `Name (ICG-ID)`, never an internal id. Picasa's
 * `.picasa.ini` pointed into a central contacts file, and a folder copied elsewhere
 * lost its names.
 */
import { createHash } from 'node:crypto'
import { ICG_ID_RE } from '@/lib/icg-id'

export type FilePerson = { name: string; icgId: string }

/**
 * Which of the two statements a person is part of (ADR-0028).
 *
 * `credited` — the cast of the set this folder is linked to; who the publisher named.
 * `claimed`  — the folder's own attributions; what the archive's owner asserts.
 */
export type PeopleSection = 'credited' | 'claimed'

export type ParsedPeopleFile = {
  credited: FilePerson[]
  claimed: FilePerson[]
  /** The `# revision:` header, when the file carries one (generated files do). */
  revision: string | null
  /** Lines that looked like an entry but were not usable — reported, never dropped. */
  errors: string[]
}

/** The app knows nobody here. The agent deletes a file that has outlived its content. */
export const EMPTY_REVISION = 'EMPTY'

/** The container for everything tool-written, one per set folder. */
export const META_DIR = '.pulseboard'
/** The identity anchor: its archiveKey is what finds a folder again after a move. */
export const ANCHOR_FILE = 'pulseboard.json'
/** The generated mirror of the app's knowledge, refreshed when its revision differs. */
export const APP_CAST_FILE = 'cast.json'
/** Per archive root, derived from the cast files — convenience, never the truth. */
export const INDEX_FILE = 'index.tsv'

/**
 * Names used before the move into `.pulseboard\` (ADR-0030). The agent deletes any
 * it finds, so a folder never carries two answers to the same question.
 */
export const LEGACY_FILES = [
  '_pulseboard.json',
  '_pulseboard_cast.txt',
  '_pulseboard_people.txt',
] as const
/** Hand-written line files, read only by the one-off `-MigrateCast` pass. */
export const LEGACY_HAND_FILES = ['_cast.txt', '_people.txt'] as const

// `Name (ICG-ID)` — the name may contain anything except the trailing bracket pair.
const ENTRY_RE = /^(.*?)\s*\(([^()]+)\)\s*$/
// The same shape anywhere inside a filename, so an extension cannot hide it.
const MARKER_RE = /^(.*?)[\s_]*\(([^()]+)\)/

/**
 * The written form of a name, reduced to the one thing that varies harmlessly.
 *
 * The catalogue names its folders `Iveta_C_(IC-87VY)`, a person types
 * `Iveta C (IC-87VY)`, and either may be lower-cased in passing. All three mean the
 * same person — and they do so because of the **ICG-ID**, which is the identity here;
 * the name is provenance. Normalising the separators keeps one person from appearing
 * as three differently-spelled entries, without pretending a name could identify
 * anyone by itself.
 *
 * Letters are left exactly as written: this is a display name, and deciding that
 * `iveta c` should be `Iveta C` is a guess the file has no business making.
 */
export function normalisePersonName(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Read one line of either file.
 *
 * A bare ICG-ID is accepted and becomes its own name: the catalogue holds people
 * whose only known name *is* their ID, and a hand-written file should not force the
 * operator to invent one.
 */
export function parsePersonLine(line: string): FilePerson | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const withBrackets = ENTRY_RE.exec(trimmed)
  if (withBrackets) {
    const name = normalisePersonName(withBrackets[1])
    const icgId = withBrackets[2].trim().toUpperCase()
    if (!ICG_ID_RE.test(icgId)) return null
    return { name: name || icgId, icgId }
  }

  const bare = trimmed.toUpperCase()
  if (ICG_ID_RE.test(bare)) return { name: bare, icgId: bare }
  return null
}

/**
 * A person from the name of a marker file.
 *
 * The whole statement is the filename: `.pulseboard/Iveta_C_(IC-87VY)`. Content is
 * never read, so a marker can be an empty file, a copy of another marker, or
 * whatever Explorer produced — and an extension makes no difference, because
 * "New → Text Document" appends `.txt` and that must not silently drop a claim.
 *
 * Our own files can never match: `pulseboard.json`, `cast.json` and `index.tsv`
 * carry no ICG-ID in brackets.
 */
export function parseCastMarkerName(fileName: string): FilePerson | null {
  const name = fileName.trim()
  if (!name) return null

  const marker = MARKER_RE.exec(name)
  if (marker) {
    const icgId = marker[2].trim().toUpperCase()
    if (!ICG_ID_RE.test(icgId)) return null
    const display = normalisePersonName(marker[1])
    return { name: display || icgId, icgId }
  }

  // A bare ID, with or without an extension: `IC-87VY` or `IC-87VY.txt`.
  const stem = name.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim().toUpperCase()
  if (ICG_ID_RE.test(stem)) return { name: stem, icgId: stem }
  return null
}

/**
 * Read the generated `cast.json` back.
 *
 * Tolerant on purpose: this file is written by us, but it sits on a disk that gets
 * moved, copied and restored, and half a file is not a reason to fail a scan.
 * Anything unreadable simply reports nothing.
 */
export function parseCastFile(text: string): ParsedPeopleFile {
  const empty: ParsedPeopleFile = { credited: [], claimed: [], revision: null, errors: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ...empty, errors: ['unreadable cast.json'] }
  }
  if (typeof parsed !== 'object' || parsed === null) return empty

  const raw = parsed as { revision?: unknown; credited?: unknown; claimed?: unknown }
  return {
    credited: readPeople(raw.credited),
    claimed: readPeople(raw.claimed),
    revision: typeof raw.revision === 'string' ? raw.revision : null,
    errors: [],
  }
}

function readPeople(value: unknown): FilePerson[] {
  if (!Array.isArray(value)) return []
  const out: FilePerson[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const person = entry as { name?: unknown; icgId?: unknown }
    if (typeof person.icgId !== 'string' || !person.icgId) continue
    const name = typeof person.name === 'string' && person.name ? person.name : person.icgId
    if (!out.some((p) => p.icgId === person.icgId)) out.push({ name, icgId: person.icgId })
  }
  return out
}

/**
 * A stable fingerprint of what the app knows about this folder.
 *
 * Sorted, so reordering does not churn the file; names included, so a rename
 * refreshes it. First 16 hex of SHA-256 — the same convention `contentSignature`
 * already uses on `ArchiveFolder`.
 */
export function peopleRevision(credited: FilePerson[], claimed: FilePerson[]): string {
  if (credited.length === 0 && claimed.length === 0) return EMPTY_REVISION
  const canonical = [
    'credited',
    ...canonicalise(credited),
    'claimed',
    ...canonicalise(claimed),
  ].join('\n')
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16)
}

function canonicalise(people: FilePerson[]): string[] {
  return people
    .map((p) => `${p.icgId}|${p.name}`)
    .sort((a, b) => a.localeCompare(b))
}

export type RenderInput = {
  archiveKey: string
  folderName: string
  /** The linked set, when the folder has one. */
  set: { channel: string | null; releaseDate: string | null; title: string } | null
  credited: FilePerson[]
  claimed: FilePerson[]
  generatedAt: Date
}

/**
 * The generated file, or null when there is nobody to write about — in which case
 * the agent removes any file that is already there.
 *
 * `revision` is written **first** on purpose: the agent compares 34k folders against
 * the server on every Full scan, and reading the first lines of each file is far
 * cheaper than parsing all of them. Emitted with two-space indentation for the same
 * reason it is written at all — so a person with no working app can read it.
 */
export function renderCastFile(input: RenderInput): string | null {
  const revision = peopleRevision(input.credited, input.claimed)
  if (revision === EMPTY_REVISION) return null

  const body = {
    revision,
    generated: input.generatedAt.toISOString(),
    archiveKey: input.archiveKey,
    folder: input.folderName,
    ...(input.set ? { set: input.set } : {}),
    credited: input.credited,
    claimed: input.claimed,
    note: `Generated by Pulseboard — do not edit. Your own entries are marker files in this folder, named "Name (ICG-ID)".`,
  }
  return `${JSON.stringify(body, null, 2)}\n`
}

/** `Name (ICG-ID)`, or the bare ID when the name adds nothing. */
export function formatPerson(person: FilePerson): string {
  return person.name && person.name !== person.icgId
    ? `${person.name} (${person.icgId})`
    : person.icgId
}
