import { describe, expect, it } from 'vitest'
import { describeMatchLabel } from '@/lib/archive-match-label'

const m = (o: Partial<Parameters<typeof describeMatchLabel>[0]>) =>
  describeMatchLabel({ dateMatches: false, titleMatches: false, dayDelta: null, confidence: 'HIGH', ...o })

describe('describeMatchLabel', () => {
  it('claims date+title only when both are identical', () => {
    const l = m({ dateMatches: true, titleMatches: true, dayDelta: 0 })
    expect(l.text).toBe('✓ date + title')
    expect(l.tone).toBe('ok')
  })

  // The reported bug: folder 2018-02-10 announced as a "date+code" match for a set
  // released 2018-02-13, because HIGH was earned by the title alone. A badge must
  // never claim agreement it does not have.
  it('never says "date" when the dates differ, however confident the match', () => {
    const l = m({ dateMatches: false, titleMatches: true, dayDelta: -3, confidence: 'HIGH' })
    expect(l.text).toContain('3 days off')
    expect(l.text).not.toContain('✓ date +')
    expect(l.tone).toBe('warn')
  })

  it('names the drift in days so the archive folder can be corrected', () => {
    expect(m({ titleMatches: true, dayDelta: 1 }).text).toContain('1 day off')
    expect(m({ titleMatches: true, dayDelta: -1 }).text).toContain('1 day off')
    expect(m({ titleMatches: true, dayDelta: 5 }).text).toContain('5 days off')
  })

  it('reports a same-date match with a differing title honestly', () => {
    const l = m({ dateMatches: true, titleMatches: false, dayDelta: 0 })
    expect(l.text).toBe('✓ date · ~ title')
    expect(l.tone).toBe('soft')
  })

  it('warns when neither field agrees', () => {
    const l = m({ dayDelta: 40, confidence: 'MEDIUM' })
    expect(l.tone).toBe('warn')
    expect(l.text).toContain('40 days off')
  })

  it('copes with a missing date rather than inventing a delta', () => {
    const l = m({ titleMatches: true, dayDelta: null })
    expect(l.text).toContain('no date')
  })

  it('always explains itself in the tooltip', () => {
    for (const l of [
      m({ dateMatches: true, titleMatches: true, dayDelta: 0 }),
      m({ titleMatches: true, dayDelta: 2 }),
      m({ dateMatches: true, dayDelta: 0 }),
      m({ dayDelta: 9 }),
    ]) {
      expect(l.title.length).toBeGreaterThan(20)
    }
  })
})
