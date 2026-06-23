/**
 * Owner-label resolution rule (ADR-0020).
 *
 * A Channel's *owning Label* is, today, the highest-confidence `ChannelLabelMap`
 * for that channel — exactly what `channelLabelMap.findFirst({ orderBy:
 * { confidence: 'desc' } })` returns. This rule is extracted as a pure function so
 * that the two consumers stay byte-identical:
 *   - set import → `Session.labelId` (`import-executor.ts`), and
 *   - the Phase-1 backfill of `Channel.labelId`.
 *
 * When `Channel.labelId` lands (ADR-0020 Phase 2) the importer reads the FK
 * directly; this function then survives only as the backfill rule. See
 * `docs/channel-label-archive-plan.md`.
 */
export type ChannelLabelMapLike = { labelId: string; confidence: number };

/**
 * Returns the labelId of the highest-confidence map, or `undefined` if there are
 * none. Ties keep input order (stable), matching the arbitrary-but-harmless
 * ordering of the live `findFirst` for the user's single-owner data.
 */
export function pickOwnerLabelId(maps: ChannelLabelMapLike[]): string | undefined {
  let best: ChannelLabelMapLike | undefined;
  for (const m of maps) {
    if (!best || m.confidence > best.confidence) best = m;
  }
  return best?.labelId;
}
