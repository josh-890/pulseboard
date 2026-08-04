/**
 * What a match badge should say, derived from what actually agrees.
 *
 * Pure so it can be tested, and shared so the staging browser, the archive banner
 * and the media queue cannot drift into three different vocabularies.
 *
 * It exists because the badge used to be inferred from the confidence alone —
 * `HIGH ? 'date+code' : 'title match'`. HIGH can be earned by an exact title on
 * its own, so a folder dated 2018-02-10 was announced as a "date+code" match for
 * a set released 2018-02-13. The operator confirms on trust and the archive keeps
 * a wrong date nobody looked at. A badge must never claim agreement it does not
 * have.
 */

export type MatchAgreement = {
  dateMatches: boolean
  titleMatches: boolean
  dayDelta: number | null
  confidence: 'HIGH' | 'MEDIUM'
}

export type MatchLabel = {
  text: string
  /** ok = everything hard agrees · warn = a real mismatch to look at · soft = weak but honest */
  tone: 'ok' | 'warn' | 'soft'
  title: string
}

export function describeMatchLabel(m: MatchAgreement): MatchLabel {
  const off = m.dayDelta === null ? null : Math.abs(m.dayDelta)
  const offText =
    off === null ? 'no date' : off === 1 ? '1 day off' : `${off} days off`

  if (m.dateMatches && m.titleMatches) {
    return { text: '✓ date + title', tone: 'ok', title: 'Date and title are identical.' }
  }
  if (m.dateMatches) {
    return {
      text: '✓ date · ~ title',
      tone: 'soft',
      title: 'Same date, but the titles differ — check the title before confirming.',
    }
  }
  if (m.titleMatches) {
    return {
      text: `~ title · date ${offText}`,
      tone: 'warn',
      title:
        `The title is identical but the dates are not (${offText}). The archive folder is ` +
        `probably named with a wrong date — worth correcting on disk before or after linking.`,
    }
  }
  return {
    text: m.confidence === 'HIGH' ? `~ similar · date ${offText}` : `~ weak · date ${offText}`,
    tone: 'warn',
    title: 'Neither the date nor the title is identical — check this one carefully.',
  }
}
