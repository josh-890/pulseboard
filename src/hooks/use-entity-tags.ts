"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addTagsToEntityAction, removeTagsFromEntityAction } from "@/lib/actions/tag-actions";
import type { EffectiveTag } from "@/lib/effective-tags";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import type { PaletteTag } from "@/lib/services/tag-service";

export type EntityTagsController = {
  entityType: TaggableEntity;
  entityId: string;
  /** Effective tags: direct + inherited (ADR-0033) */
  tags: EffectiveTag[];
  directTagIds: string[];
  isLoading: boolean;
  /** Add or remove one direct tag; optimistic, then re-read the effective set */
  toggle: (tag: PaletteTag, on: boolean) => void;
  remove: (tagId: string) => void;
  /** Re-read after a change made elsewhere (e.g. a resolved disk marker) */
  refresh: () => void;
};

export function fromPaletteTag(tag: PaletteTag): EffectiveTag {
  return {
    id: tag.id,
    name: tag.name,
    group: { name: tag.group.name, color: tag.group.color },
    groupId: tag.group.id,
    isExclusive: tag.group.isExclusive,
    kind: tag.group.kind,
    parentId: tag.parentId,
    source: "DIRECT",
    origin: null,
    overridden: false,
  };
}

/**
 * One entity's tags, editable. Seeded from server-rendered `initialTags` when
 * given (detail pages), otherwise fetched (lightbox, where the current image
 * changes). Writes go through add/remove actions — never a full replace — so
 * a stale client list cannot wipe a tag added elsewhere.
 */
export function useEntityTags(
  entityType: TaggableEntity,
  entityId: string | null,
  initialTags?: EffectiveTag[],
): EntityTagsController | null {
  const [byEntity, setByEntity] = useState<Map<string, EffectiveTag[]>>(() =>
    initialTags && entityId ? new Map([[entityId, initialTags]]) : new Map(),
  );
  const [, startTransition] = useTransition();
  // Per-entity request sequence: a slow older response never overwrites a newer one
  const fetchSeq = useRef(new Map<string, number>());
  // Writes still in flight per entity. While any is pending a re-read would
  // show a state from before it (keys pressed in quick succession flicker), so
  // results are ignored and one re-read follows the last write.
  const pending = useRef(new Map<string, number>());

  const refetch = useCallback(
    (id: string) => {
      const seq = (fetchSeq.current.get(id) ?? 0) + 1;
      fetchSeq.current.set(id, seq);
      fetch(`/api/tags/entity?entityType=${entityType}&entityId=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((tags: EffectiveTag[]) => {
          if (fetchSeq.current.get(id) !== seq || (pending.current.get(id) ?? 0) > 0) return;
          setByEntity((m) => new Map(m).set(id, tags));
        })
        .catch(() => {
          // Leave what is shown; the next change re-reads
        });
    },
    [entityType],
  );

  /** Run one write, counting it as pending; the last one to finish re-reads. */
  const track = useCallback(
    async <T,>(id: string, write: () => Promise<T>): Promise<T> => {
      pending.current.set(id, (pending.current.get(id) ?? 0) + 1);
      try {
        return await write();
      } finally {
        const left = (pending.current.get(id) ?? 1) - 1;
        pending.current.set(id, left);
        if (left === 0) refetch(id);
      }
    },
    [refetch],
  );

  const known = entityId ? byEntity.has(entityId) : true;
  useEffect(() => {
    if (entityId && !known) refetch(entityId);
  }, [entityId, known, refetch]);

  const tags = useMemo(() => (entityId ? byEntity.get(entityId) ?? [] : []), [byEntity, entityId]);
  const directTagIds = useMemo(() => tags.filter((t) => t.source === "DIRECT").map((t) => t.id), [tags]);

  const toggle = useCallback(
    (tag: PaletteTag, on: boolean) => {
      if (!entityId) return;
      const id = entityId;
      setByEntity((m) => {
        const cur = m.get(id) ?? [];
        const next = on
          ? [
              // An exclusive group keeps one direct tag: the new pick replaces it
              ...cur.filter((t) => !(t.source === "DIRECT" && tag.group.isExclusive && t.groupId === tag.group.id)),
              fromPaletteTag(tag),
            ]
          : cur.filter((t) => !(t.source === "DIRECT" && t.id === tag.id));
        return new Map(m).set(id, next);
      });
      startTransition(async () => {
        const res = await track(id, () =>
          on ? addTagsToEntityAction(entityType, id, [tag.id]) : removeTagsFromEntityAction(entityType, id, [tag.id]),
        );
        if (!res.success) toast.error(res.error ?? "Failed to update tags");
      });
    },
    [entityId, entityType, track],
  );

  const remove = useCallback(
    (tagId: string) => {
      if (!entityId) return;
      const id = entityId;
      setByEntity((m) => new Map(m).set(id, (m.get(id) ?? []).filter((t) => !(t.source === "DIRECT" && t.id === tagId))));
      startTransition(async () => {
        const res = await track(id, () => removeTagsFromEntityAction(entityType, id, [tagId]));
        if (!res.success) toast.error(res.error ?? "Failed to remove tag");
      });
    },
    [entityId, entityType, track],
  );

  if (!entityId) return null;
  const id = entityId;
  return { entityType, entityId, tags, directTagIds, isLoading: !known, toggle, remove, refresh: () => refetch(id) };
}
