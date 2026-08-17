/**
 * Which channel name to put on screen.
 *
 * `StagingSet.channelName` is **provenance**: the spelling the import file used.
 * `Channel.name` is the record. They differ for 27,684 of the 28,295 staged sets
 * that have a channel (97.8 %) — "KATYA CLOVER" from the file against
 * "KatyaClover" in the catalogue — and 30 channels carry more than one spelling
 * across their sets.
 *
 * Nothing is split: those rows all point at one `Channel` by id, held together by
 * its `importAliases`. But a list that renders the raw string shows the same
 * channel under two names depending on where the row came from, and reads as a
 * data problem that is not there.
 *
 * So: **the record when it is resolved, the raw string only when it is not** —
 * which is exactly 11 staged sets, the ones whose channel never matched anything
 * and where the file's spelling is the only thing known.
 *
 * The same precedence `resolveCreditedAs` applies to alias vs. raw credit name
 * (ADR-0024). Deliberately *not* applied where the raw value is the subject:
 * the import-vs-set comparison grid must show what the file said, or the
 * comparison means nothing.
 */
export function channelLabel(item: {
  channelName?: string | null
  channel?: { name: string } | null
}): string {
  return item.channel?.name ?? item.channelName ?? 'Unknown Channel'
}
