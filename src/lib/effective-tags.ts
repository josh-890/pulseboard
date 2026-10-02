import type { TagGroupKind } from "@/generated/prisma/client";
import type { TagChipData } from "@/lib/types/tag";

// Effective tags (ADR-0033): an entity's direct tags plus those inherited down
// the content chain — Session → Set → Image. Pure, so the rules are pinned by
// unit tests and the S4 SQL view can be checked against the same cases.
//
//   - Workflow-kind groups never inherit (a to-do on a set is not a to-do on
//     each image).
//   - A tag present on several levels shows once, at the nearest level.
//   - Exclusive groups: the nearest level wins (image > set > session); a
//     farther-away tag of that group is kept but marked `overridden`.
//   - Two sets carrying different tags of one exclusive group tie — neither
//     overrides the other.

export type TagSourceLevel = "DIRECT" | "SET" | "SESSION";

const LEVEL_RANK: Record<TagSourceLevel, number> = { DIRECT: 0, SET: 1, SESSION: 2 };

export type TagFact = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  group: {
    id: string;
    name: string;
    color: string;
    isExclusive: boolean;
    kind: TagGroupKind;
    sortOrder: number;
  };
};

/** Where an inherited tag came from, for the "from set …" badge */
export type TagOrigin = { level: Exclude<TagSourceLevel, "DIRECT">; id: string; label: string };

export type EffectiveTag = TagChipData & {
  groupId: string;
  isExclusive: boolean;
  kind: TagGroupKind;
  parentId: string | null;
  source: TagSourceLevel;
  /** Present for inherited tags */
  origin: TagOrigin | null;
  /** An exclusive-group tag shadowed by a nearer level */
  overridden: boolean;
};

export type InheritedTags = { origin: TagOrigin; tags: TagFact[] };

export function resolveEffectiveTags(direct: TagFact[], inherited: InheritedTags[]): EffectiveTag[] {
  const byTag = new Map<string, EffectiveTag>();

  const offer = (tag: TagFact, source: TagSourceLevel, origin: TagOrigin | null) => {
    const existing = byTag.get(tag.id);
    if (existing && LEVEL_RANK[existing.source] <= LEVEL_RANK[source]) return;
    byTag.set(tag.id, {
      id: tag.id,
      name: tag.name,
      group: { name: tag.group.name, color: tag.group.color },
      groupId: tag.group.id,
      isExclusive: tag.group.isExclusive,
      kind: tag.group.kind,
      parentId: tag.parentId,
      source,
      origin,
      overridden: false,
    });
  };

  for (const t of direct) offer(t, "DIRECT", null);
  for (const { origin, tags } of inherited) {
    for (const t of tags) {
      if (t.group.kind === "WORKFLOW") continue;
      offer(t, origin.level, origin);
    }
  }

  const result = [...byTag.values()];

  // Nearest level wins inside an exclusive group
  const bestRank = new Map<string, number>();
  for (const t of result) {
    if (!t.isExclusive) continue;
    const r = LEVEL_RANK[t.source];
    bestRank.set(t.groupId, Math.min(bestRank.get(t.groupId) ?? r, r));
  }
  for (const t of result) {
    if (t.isExclusive && LEVEL_RANK[t.source] > (bestRank.get(t.groupId) ?? 0)) t.overridden = true;
  }

  const order = new Map<string, [number, number]>();
  for (const t of [...direct, ...inherited.flatMap((i) => i.tags)]) {
    order.set(t.id, [t.group.sortOrder, t.sortOrder]);
  }
  return result.sort((a, b) => {
    const [ga, ta] = order.get(a.id) ?? [0, 0];
    const [gb, tb] = order.get(b.id) ?? [0, 0];
    return ga - gb || ta - tb || LEVEL_RANK[a.source] - LEVEL_RANK[b.source];
  });
}
