/**
 * Which channel name to put on screen, and when the import's own name still matters.
 *
 * `StagingSet.channelName` is **provenance**: the spelling the import file used.
 * `Channel.name` is the record. They disagree for 27,684 of the 28,295 staged
 * sets that have a channel, and the disagreement is of two entirely different
 * kinds — measured on xpulse:
 *
 *   **26,340 rows — the same name, written differently.** "KATYA CLOVER" against
 *   "KatyaClover", "ALS SCAN" against "ALSScan". Noise from the file's
 *   formatting; showing it makes one channel look like several.
 *
 *   **1,955 rows across 42 channels — a different name, mapped on purpose.**
 *   "ALS ARCHIVE" → ALSScan, "ONLYTEASE COVERS" → OnlyTease, "METARTINTIMATE" →
 *   MetArt: a base channel and its archive or cover feed, deliberately kept as
 *   one channel. Here the imported name carries information the record does not,
 *   and hiding it would also hide a *wrong* mapping — "ALSANGELS" → ALSScan is
 *   visible only because the name differs.
 *
 * So: the record is the label, and the file's name is shown beside it exactly
 * when it is not merely a respelling. The test for "merely a respelling" is
 * separators, case and accents — deliberately nothing cleverer, because the
 * moment it starts folding words it starts hiding the second kind.
 */

/** Case, accents and separators removed — everything a respelling can vary. */
function squash(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export type ChannelDisplay = {
  /** What to show as the channel. */
  label: string
  /**
   * The import file's own name, when it says something the label does not.
   * `null` for a respelling, and for a row whose channel never resolved (the
   * label is already the file's name there).
   */
  importedAs: string | null
}

export function channelDisplay(item: {
  channelName?: string | null
  channel?: { name: string } | null
}): ChannelDisplay {
  const canonical = item.channel?.name
  const raw = item.channelName ?? null

  if (!canonical) return { label: raw ?? 'Unknown Channel', importedAs: null }
  if (!raw || squash(raw) === squash(canonical)) return { label: canonical, importedAs: null }
  return { label: canonical, importedAs: raw }
}

/** Just the label, for the places that have no room for the provenance. */
export function channelLabel(item: {
  channelName?: string | null
  channel?: { name: string } | null
}): string {
  return channelDisplay(item).label
}
