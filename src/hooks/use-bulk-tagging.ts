"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkAddTagsToEntitiesAction, bulkRemoveTagsFromEntitiesAction } from "@/lib/actions/tag-actions";
import type { PaletteTag } from "@/lib/services/tag-service";
import type { TaggableEntity } from "@/lib/tag-domains";

export type BulkTagChange = { tag: PaletteTag; on: boolean; entityIds: string[] };

/**
 * Tag a selection (ADR-0033, S3). Reads how many selected items carry each tag
 * (tri-state), applies add-to-all / remove-from-all, and reports each change so
 * the caller can update its tiles without a reload.
 */
export function useBulkTagging(
  entityType: TaggableEntity,
  entityIds: string[],
  onApplied?: (change: BulkTagChange) => void,
) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [, startTransition] = useTransition();
  const seq = useRef(0);
  // The selection is a fresh array every render; callbacks read it through refs
  // so they stay stable (a changing loadCounts would re-fetch in a loop).
  const idsRef = useRef(entityIds);
  const onAppliedRef = useRef(onApplied);
  useEffect(() => {
    idsRef.current = entityIds;
    onAppliedRef.current = onApplied;
  });

  const loadCounts = useCallback(() => {
    const mine = ++seq.current;
    fetch("/api/tags/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, ids: idsRef.current }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        if (mine === seq.current) setCounts(c);
      })
      .catch(() => toast.error("Could not read the selection's tags"));
  }, [entityType]);

  /** Add to all (`on`) or remove from all; optimistic counts, then re-read. */
  const apply = useCallback(
    (tag: PaletteTag, on: boolean) => {
      const ids = idsRef.current;
      if (ids.length === 0) return;
      setCounts((c) => {
        const next = { ...(c ?? {}) };
        next[tag.id] = on ? ids.length : 0;
        return next;
      });
      onAppliedRef.current?.({ tag, on, entityIds: ids });
      startTransition(async () => {
        const res = on
          ? await bulkAddTagsToEntitiesAction(entityType, ids, [tag.id])
          : await bulkRemoveTagsFromEntitiesAction(entityType, ids, [tag.id]);
        if (!res.success) toast.error(res.error ?? "Failed to update tags");
        else toast.success(`${on ? "Tagged" : "Untagged"} ${ids.length} — ${tag.name}`);
        loadCounts();
      });
    },
    [entityType, loadCounts],
  );

  return { counts, loadCounts, apply };
}
