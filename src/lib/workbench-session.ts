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

/**
 * How much the on-cover overlay says.
 *
 * The folder name used to sit below the image — about 370 px from where the eye
 * rests on the cover, roughly 10° of visual angle. Useful vision is 1–2°, and a
 * saccade costs 30–120 ms of movement plus a ~200 ms refractory period with
 * almost no intake in between; two of those per folder is a minute of pure eye
 * travel over a 150-folder group. So the identity moves onto the item, which is
 * what Lightroom's Loupe Info overlay has always done.
 *
 * `off` exists for the same reason Lightroom's does: on a cover that fills the
 * frame the overlay lands on the picture, and sometimes the picture wins.
 */
export type OverlayLevel = 'off' | 'name' | 'detail'

/** Cycles name → detail → off, so the useful states come first. */
export function nextOverlayLevel(level: OverlayLevel): OverlayLevel {
  return level === 'name' ? 'detail' : level === 'detail' ? 'off' : 'name'
}

export type WorkbenchViewPrefs = {
  overlay: OverlayLevel
  filmstrip: boolean
  /**
   * Collect mode: every assignment adds and holds the folder, and `Enter`
   * finishes it — Shift latched, for a run of sets with several people in each.
   * Off by default, because the common folder has exactly one person and one
   * keystroke should still answer it.
   */
  collect: boolean
}

export const DEFAULT_VIEW_PREFS: WorkbenchViewPrefs = { overlay: 'name', filmstrip: true, collect: false }

const PREFS_KEY = 'pulseboard.workbench.view'

/** A minimal storage shape, so the round-trip is testable without a browser. */
export type PrefStore = Pick<Storage, 'getItem' | 'setItem'>

/**
 * View preferences survive the session.
 *
 * A habit formed while working through one group should still be there for the
 * next one; having to press `T` again every time is its own small friction.
 * Anything unparseable falls back to the defaults rather than throwing — a
 * corrupted preference must never keep the workbench from opening.
 */
export function readViewPrefs(store: PrefStore | undefined): WorkbenchViewPrefs {
  if (!store) return DEFAULT_VIEW_PREFS
  try {
    const raw = store.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_VIEW_PREFS
    const parsed = JSON.parse(raw) as Partial<WorkbenchViewPrefs>
    return {
      overlay:
        parsed.overlay === 'off' || parsed.overlay === 'name' || parsed.overlay === 'detail'
          ? parsed.overlay
          : DEFAULT_VIEW_PREFS.overlay,
      filmstrip: typeof parsed.filmstrip === 'boolean' ? parsed.filmstrip : DEFAULT_VIEW_PREFS.filmstrip,
      collect: typeof parsed.collect === 'boolean' ? parsed.collect : DEFAULT_VIEW_PREFS.collect,
    }
  } catch {
    return DEFAULT_VIEW_PREFS
  }
}

export function writeViewPrefs(store: PrefStore | undefined, prefs: WorkbenchViewPrefs): void {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // A full or blocked storage is not a reason to interrupt the work.
  }
}

/**
 * The width of one empty column beside a cover drawn with `object-contain`.
 *
 * The browser knows where it painted the photo but will not say, so it is derived
 * from the natural size and the box it was fitted into. This is what decides
 * whether the identity overlay can sit *beside* a portrait cover instead of on
 * top of it — the difference between reading the folder name and hiding the face
 * being judged.
 *
 * Returns 0 for anything degenerate (an image that has not loaded, a zero-sized
 * box), which the caller reads as "no room" and falls back to the scrim.
 */
export function letterboxColumn(
  box: { width: number; height: number },
  natural: { width: number; height: number },
): number {
  if (box.width <= 0 || box.height <= 0 || natural.width <= 0 || natural.height <= 0) return 0
  const scale = Math.min(box.width / natural.width, box.height / natural.height)
  return Math.max(0, (box.width - natural.width * scale) / 2)
}

/** Narrower than this and a column holds no readable line, only a stack of words. */
export const MIN_OVERLAY_WIDTH = 170
