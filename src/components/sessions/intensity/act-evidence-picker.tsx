"use client";

import { useCallback, useEffect, useState } from "react";
import { MediaPickerShell, type PickerItem } from "@/components/media/media-picker-shell";

type SearchResult = {
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

const toPickerItem = (r: SearchResult): PickerItem => ({
  id: r.id,
  thumbUrl: r.thumbUrl,
  previewUrl: r.previewUrl ?? r.thumbUrl,
  zoomUrl: r.zoomUrl ?? null,
  focalX: r.focalX ?? null,
  focalY: r.focalY ?? null,
  caption: r.filename,
  width: r.originalWidth,
  height: r.originalHeight,
});

export type ActEvidencePickerProps = {
  sessionId: string;
  /** e.g. "Topless — Anna (AB-1)" */
  title: string;
  initialIds: string[];
  onClose: () => void;
  onSave: (mediaItemIds: string[]) => void;
};

// The panel's way to evidence (ADR-0036, 3b): the session's photos in the big
// picker, the ones already linked to this act marked; Save keeps the marked.
export function ActEvidencePicker({ sessionId, title, initialIds, onClose, onSave }: ActEvidencePickerProps) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(initialIds);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ sessionId, galleryOnly: "1", limit: "100" });
        if (after) params.set("cursor", after);
        const res = await fetch(`/api/media/search?${params.toString()}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: SearchResult[]; nextCursor: string | null };
        setItems((prev) => [...(after ? prev : []), ...data.items.map(toPickerItem)]);
        setCursor(data.nextCursor);
        setError(null);
      } catch {
        setError("Could not load the photos");
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const unchanged = selected.length === initialIds.length && selected.every((id) => initialIds.includes(id));

  return (
    <MediaPickerShell
      title={title}
      items={items}
      loading={loading}
      error={error}
      hasMore={cursor !== null}
      onLoadMore={() => cursor && void load(cursor)}
      onClose={onClose}
      selectionMode="multi"
      selectedIds={selected}
      onSelectionChange={setSelected}
      onConfirm={(ids) => {
        onSave(ids);
        onClose();
      }}
      confirmLabel="Save"
      confirmDisabled={unchanged}
    />
  );
}
