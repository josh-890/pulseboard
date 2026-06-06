"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addMediaToSkillEventAction,
  removeMediaFromSkillEventAction,
} from "@/lib/actions/skill-actions";
import { MediaPickerShell, type PickerItem } from "@/components/media/media-picker-shell";

type MediaSearchResult = {
  id: string;
  filename: string;
  originalWidth: number;
  originalHeight: number;
  thumbUrl: string;
  previewUrl?: string;
  zoomUrl?: string | null;
  focalX?: number | null;
  focalY?: number | null;
};

type ActionResult = { success: boolean; error?: string };

type SkillEventMediaPickerProps = {
  eventId: string;
  sessionId: string;
  personId: string;
  existingMediaIds: string[];
  onClose: () => void;
  onAddMedia?: (mediaItemIds: string[]) => Promise<ActionResult>;
  onRemoveMedia?: (mediaItemId: string) => Promise<ActionResult>;
};

function toPickerItem(r: MediaSearchResult): PickerItem {
  return {
    id: r.id,
    thumbUrl: r.thumbUrl,
    previewUrl: r.previewUrl ?? r.thumbUrl,
    zoomUrl: r.zoomUrl ?? null,
    focalX: r.focalX ?? null,
    focalY: r.focalY ?? null,
    caption: r.filename,
    width: r.originalWidth,
    height: r.originalHeight,
  };
}

export function SkillEventMediaPicker({
  eventId,
  sessionId,
  personId,
  existingMediaIds,
  onClose,
  onAddMedia,
  onRemoveMedia,
}: SkillEventMediaPickerProps) {
  const router = useRouter();
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("sessionId", sessionId);
      params.set("limit", "100");
      const res = await fetch(`/api/media/search?${params.toString()}`);
      const data = (await res.json()) as { items: MediaSearchResult[] };
      setResults(data.items);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const pickerItems = useMemo(() => results.map(toPickerItem), [results]);

  const handleConfirm = useCallback(async (ids: string[]) => {
    const selected = new Set(ids);
    const existingSet = new Set(existingMediaIds);
    const toAdd = ids.filter((id) => !existingSet.has(id));
    const toRemove = existingMediaIds.filter((id) => !selected.has(id));

    let hasError = false;
    for (const mediaItemId of toRemove) {
      const result = onRemoveMedia
        ? await onRemoveMedia(mediaItemId)
        : await removeMediaFromSkillEventAction(eventId, mediaItemId, personId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to remove media");
        hasError = true;
        break;
      }
    }

    if (!hasError && toAdd.length > 0) {
      const result = onAddMedia
        ? await onAddMedia(toAdd)
        : await addMediaToSkillEventAction(eventId, toAdd, personId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to add media");
        hasError = true;
      }
    }

    if (!hasError) {
      const changed = toAdd.length + toRemove.length;
      if (changed > 0) toast.success(`Updated ${changed} media link${changed > 1 ? "s" : ""}`);
      onClose();
      router.refresh();
    }
  }, [eventId, personId, existingMediaIds, onAddMedia, onRemoveMedia, onClose, router]);

  return (
    <MediaPickerShell
      title="Link session media"
      items={pickerItems}
      loading={loading}
      onClose={onClose}
      selectionMode="multi"
      initialSelectedIds={existingMediaIds}
      onConfirm={handleConfirm}
      confirmLabel="Save"
    />
  );
}
