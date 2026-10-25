// The archive "key" of a set: its release day and channel (2026-10-25). Both are
// usually right where title and name drift, so the folders that share it — and
// the days a typing slip turns it into — are the ones worth looking at. Pure, so
// the staged-sets popover can label the rows with the same words.

export type ArchiveKeyDayKind = "same" | "near" | "swapped"

export type ArchiveKeyDay = {
  /** The day, as YYYY-MM-DD (UTC) */
  day: string
  kind: ArchiveKeyDayKind
  /** Days from the set's own day; 0 for the same day and for a swap */
  offset: number
}

/** How far a near miss may lie, in days either way. */
export const ARCHIVE_KEY_NEAR_DAYS = 2

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The days to look at for a set released on `date`: the day itself, ±2 days, and
 * the day with day and month swapped (10-05 ↔ 05-10) when that is another real
 * date. A swap that falls inside the near window is reported as near.
 */
export function archiveKeyDays(date: Date): ArchiveKeyDay[] {
  const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const days: ArchiveKeyDay[] = [{ day: iso(new Date(base)), kind: "same", offset: 0 }]
  for (let i = 1; i <= ARCHIVE_KEY_NEAR_DAYS; i++) {
    days.push({ day: iso(new Date(base - i * 86_400_000)), kind: "near", offset: -i })
    days.push({ day: iso(new Date(base + i * 86_400_000)), kind: "near", offset: i })
  }
  const d = date.getUTCDate()
  const m = date.getUTCMonth() + 1
  if (d <= 12 && d !== m) {
    const swapped = iso(new Date(Date.UTC(date.getUTCFullYear(), d - 1, m)))
    if (!days.some((x) => x.day === swapped)) days.push({ day: swapped, kind: "swapped", offset: 0 })
  }
  return days
}

/** "+1 day", "−2 days", "day/month swapped" — empty for the same day. */
export function describeArchiveKeyDay(kind: ArchiveKeyDayKind, offset: number): string {
  if (kind === "swapped") return "day/month swapped"
  if (kind === "same" || offset === 0) return ""
  const n = Math.abs(offset)
  return `${offset > 0 ? "+" : "−"}${n} day${n === 1 ? "" : "s"}`
}
