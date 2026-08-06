/**
 * The rules a workbench session runs on — pure, so they can be tested without a
 * database and cannot drift into a component.
 *
 * The workbench asks one of two questions, and which one is right depends on the
 * group rather than on taste:
 *
 *   person-led  "is THIS folder Nata?"      — binary, one key per folder
 *   folder-led  "who is in THIS folder?"    — a choice among candidates
 *
 * `MPL | nata` has 80 of 83 folders naming one person: asking "who is this" 83
 * times is 83 choices where 83 yes/no answers would do, and near-binary review is
 * where the measured throughput gain lives. `AA | Anna` collects several
 * different people behind one alias, and there a binary question is simply the
 * wrong question.
 */

export type WorkbenchMode = 'person' | 'folder'

export type SessionFolder = {
  id: string
  identity: 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED'
  suggestions: { icgId: string }[]
  rejectedIcgIds: string[]
}

export type SessionVote = { icgId: string; name: string; folders: number }

/**
 * A candidate must carry this share of the group's *suggested* folders before the
 * binary question is the right one to ask.
 *
 * 0.6 rather than a bare majority: at 51 % nearly half the folders would answer
 * "no", and a person-led pass that says no half the time is a folder-led pass
 * wearing the wrong interface.
 */
export const PERSON_LED_THRESHOLD = 0.6

/** Who the group is mostly about, or null when nobody dominates it. */
export function dominantCandidate(votes: SessionVote[], votedFolders: number): SessionVote | null {
  if (votedFolders === 0 || votes.length === 0) return null
  const top = [...votes].sort((a, b) => b.folders - a.folders || a.icgId.localeCompare(b.icgId))[0]
  return top.folders / votedFolders >= PERSON_LED_THRESHOLD ? top : null
}

/**
 * Which question this group should open with.
 *
 * A group nobody has suggested anyone for is folder-led: there is no one to pin,
 * and the operator will be reaching for the search.
 */
export function defaultMode(votes: SessionVote[], votedFolders: number): WorkbenchMode {
  return dominantCandidate(votes, votedFolders) ? 'person' : 'folder'
}

/**
 * The folders a pass should visit.
 *
 * Decided folders leave the path, not just the view — walking the cursor through
 * a card that is already answered is the thing that makes a long group feel
 * endless. `all` exists for looking back at what was decided.
 */
export function sessionFolders<T extends Pick<SessionFolder, 'identity'>>(
  folders: T[],
  filter: 'open' | 'all' | 'decided',
): T[] {
  if (filter === 'all') return folders
  if (filter === 'decided') return folders.filter((f) => f.identity !== 'OPEN')
  return folders.filter((f) => f.identity === 'OPEN')
}

export type SessionProgress = {
  total: number
  decided: number
  open: number
  /** True when nothing is left to answer — the moment to offer the next group. */
  finished: boolean
}

export function sessionProgress(folders: Pick<SessionFolder, 'identity'>[]): SessionProgress {
  const total = folders.length
  const open = folders.filter((f) => f.identity === 'OPEN').length
  return { total, decided: total - open, open, finished: total > 0 && open === 0 }
}

/**
 * Where the cursor lands after a folder is answered.
 *
 * Answering removes the folder from the open pass, so "the next one" is the item
 * that has taken the current index — not index + 1, which would skip a folder
 * every single time. When the answered folder was the last, the cursor steps back
 * rather than pointing past the end.
 */
export function nextIndexAfterDecision(index: number, remainingCount: number): number {
  if (remainingCount <= 0) return 0
  return Math.min(index, remainingCount - 1)
}

/**
 * Covers worth having in the browser cache already.
 *
 * Forward-weighted because that is where the cursor goes; one backwards because
 * undo and second thoughts are common. Narrative Select's whole pitch is that the
 * next image is simply *there* when the key is pressed.
 */
export function preloadWindow<T>(items: T[], index: number, ahead = 3, behind = 1): T[] {
  const out: T[] = []
  for (let i = index - behind; i <= index + ahead; i++) {
    if (i >= 0 && i < items.length && i !== index) out.push(items[i])
  }
  return out
}
