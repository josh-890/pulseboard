import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW_PREFS,
  MIN_OVERLAY_WIDTH,
  PERSON_LED_THRESHOLD,
  letterboxColumn,
  nextOverlayLevel,
  readViewPrefs,
  writeViewPrefs,
  defaultMode,
  dominantCandidate,
  nextIndexAfterDecision,
  preloadWindow,
  sessionFolders,
  sessionProgress,
  type SessionFolder,
  type WorkbenchViewPrefs,
} from '@/lib/workbench-session'

/** An in-memory Storage stand-in, so the round-trip needs no browser. */
function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  }
}

const v = (icgId: string, folders: number) => ({ icgId, name: icgId, folders })
const f = (id: string, identity: SessionFolder['identity'] = 'OPEN'): SessionFolder => ({
  id,
  identity,
  suggestions: [],
  rejectedIcgIds: [],
})

describe('dominantCandidate / defaultMode', () => {
  // MPL|nata: 80 of 83 name one person. Asking "who is this" 83 times is 83
  // choices where 83 yes/no answers would do.
  it('opens person-led when one candidate carries the group', () => {
    const votes = [v('NA-01', 80), v('EM-02', 1), v('MI-03', 1), v('NE-04', 1)]
    expect(dominantCandidate(votes, 83)?.icgId).toBe('NA-01')
    expect(defaultMode(votes, 83)).toBe('person')
  })

  // AA|Anna: several different people behind one alias. A binary question is the
  // wrong question there, not merely a slower one.
  it('opens folder-led when the group is split', () => {
    const votes = [v('AN-01', 6), v('AB-02', 5), v('AE-03', 4)]
    expect(dominantCandidate(votes, 15)).toBeNull()
    expect(defaultMode(votes, 15)).toBe('folder')
  })

  it('needs more than a bare majority', () => {
    // At 51% nearly half the folders answer "no" — that is a folder-led pass
    // wearing the wrong interface.
    expect(defaultMode([v('A', 51), v('B', 49)], 100)).toBe('folder')
    expect(defaultMode([v('A', Math.ceil(PERSON_LED_THRESHOLD * 100)), v('B', 40)], 100)).toBe('person')
  })

  it('is folder-led when nobody has been suggested at all', () => {
    expect(dominantCandidate([], 0)).toBeNull()
    expect(defaultMode([], 0)).toBe('folder')
  })

  it('does not mutate the votes it was given', () => {
    const votes = [v('B', 1), v('A', 9)]
    dominantCandidate(votes, 10)
    expect(votes.map((x) => x.icgId)).toEqual(['B', 'A'])
  })
})

describe('sessionFolders', () => {
  const all = [f('a'), f('b', 'CONFIRMED'), f('c', 'REJECTED'), f('d'), f('e', 'SKIPPED')]

  it('walks only open folders by default', () => {
    expect(sessionFolders(all, 'open').map((x) => x.id)).toEqual(['a', 'd'])
  })

  it('can look back at what was decided', () => {
    expect(sessionFolders(all, 'decided').map((x) => x.id)).toEqual(['b', 'c', 'e'])
    expect(sessionFolders(all, 'all')).toHaveLength(5)
  })
})

describe('sessionProgress', () => {
  it('counts every non-open state as decided', () => {
    const p = sessionProgress([f('a'), f('b', 'CONFIRMED'), f('c', 'SKIPPED')])
    expect(p).toEqual({ total: 3, decided: 2, open: 1, finished: false })
  })

  it('reports finished only when nothing is open', () => {
    expect(sessionProgress([f('a', 'CONFIRMED')]).finished).toBe(true)
    expect(sessionProgress([f('a')]).finished).toBe(false)
  })

  it('an empty group is not "finished" — there was nothing to finish', () => {
    expect(sessionProgress([]).finished).toBe(false)
  })
})

describe('nextIndexAfterDecision', () => {
  // Answering removes the folder from the open pass, so the next item has taken
  // the current index. Advancing to index+1 would skip a folder every time.
  it('stays on the index the next folder has moved into', () => {
    expect(nextIndexAfterDecision(0, 5)).toBe(0)
    expect(nextIndexAfterDecision(3, 8)).toBe(3)
  })

  it('steps back when the last folder was the one answered', () => {
    expect(nextIndexAfterDecision(4, 4)).toBe(3)
  })

  it('lands on 0 when the pass is now empty', () => {
    expect(nextIndexAfterDecision(2, 0)).toBe(0)
  })
})

describe('preloadWindow', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

  it('leans forward, keeps one back, and never includes the current item', () => {
    expect(preloadWindow(items, 3)).toEqual(['c', 'e', 'f', 'g'])
  })

  it('clamps at both ends', () => {
    expect(preloadWindow(items, 0)).toEqual(['b', 'c', 'd'])
    expect(preloadWindow(items, 6)).toEqual(['f'])
  })

  it('copes with a single item and an empty list', () => {
    expect(preloadWindow(['only'], 0)).toEqual([])
    expect(preloadWindow([], 0)).toEqual([])
  })
})

describe('nextOverlayLevel', () => {
  it('cycles through the useful states first, then off', () => {
    expect(nextOverlayLevel('name')).toBe('detail')
    expect(nextOverlayLevel('detail')).toBe('off')
    expect(nextOverlayLevel('off')).toBe('name')
  })

  it('returns to where it started after three presses', () => {
    expect(nextOverlayLevel(nextOverlayLevel(nextOverlayLevel('name')))).toBe('name')
  })
})

describe('view preferences', () => {
  it('round-trips through storage', () => {
    const store = memoryStore()
    const prefs: WorkbenchViewPrefs = { overlay: 'detail', filmstrip: false, collect: true }
    writeViewPrefs(store, prefs)
    expect(readViewPrefs(store)).toEqual(prefs)
  })

  it('falls back to the defaults when nothing is stored', () => {
    expect(readViewPrefs(memoryStore())).toEqual(DEFAULT_VIEW_PREFS)
    expect(readViewPrefs(undefined)).toEqual(DEFAULT_VIEW_PREFS)
  })

  // A corrupted preference must never keep the workbench from opening.
  it('survives junk and half-written values', () => {
    const store = memoryStore()
    store.raw.set('pulseboard.workbench.view', '{not json')
    expect(readViewPrefs(store)).toEqual(DEFAULT_VIEW_PREFS)

    store.raw.set('pulseboard.workbench.view', JSON.stringify({ overlay: 'nonsense' }))
    expect(readViewPrefs(store)).toEqual(DEFAULT_VIEW_PREFS)

    store.raw.set('pulseboard.workbench.view', JSON.stringify({ filmstrip: false }))
    expect(readViewPrefs(store)).toEqual({ overlay: 'name', filmstrip: false, collect: false })

    // Collect mode is off unless it says so: a half-written preference must not
    // silently latch Shift for a whole pass.
    store.raw.set('pulseboard.workbench.view', JSON.stringify({ collect: 'yes' }))
    expect(readViewPrefs(store).collect).toBe(false)
  })

  it('does not throw when storage refuses to write', () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => writeViewPrefs(blocked, DEFAULT_VIEW_PREFS)).not.toThrow()
  })
})

describe('letterboxColumn', () => {
  // The archive is overwhelmingly 3:4 covers, and the main area is wide: this is
  // the case the whole overlay placement rests on.
  it('leaves room beside a portrait cover in a wide frame', () => {
    const column = letterboxColumn({ width: 832, height: 512 }, { width: 900, height: 1200 })
    expect(column).toBe(224)
    expect(column).toBeGreaterThanOrEqual(MIN_OVERLAY_WIDTH)
  })

  it('reports no room when the cover fills the frame', () => {
    // A 16:9 still in a 1.63:1 frame is limited by width — no columns at all.
    expect(letterboxColumn({ width: 832, height: 512 }, { width: 1920, height: 1080 })).toBe(0)
  })

  it('reports a column too narrow to use rather than pretending', () => {
    const column = letterboxColumn({ width: 832, height: 512 }, { width: 1000, height: 700 })
    expect(column).toBeGreaterThan(0)
    expect(column).toBeLessThan(MIN_OVERLAY_WIDTH)
  })

  it('is 0 for an image that has not loaded or a collapsed box', () => {
    expect(letterboxColumn({ width: 832, height: 512 }, { width: 0, height: 0 })).toBe(0)
    expect(letterboxColumn({ width: 0, height: 0 }, { width: 900, height: 1200 })).toBe(0)
  })
})
