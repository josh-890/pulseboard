"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  linkMediaToDetailCategoryAction,
  unlinkMediaFromDetailCategoryAction,
} from "@/lib/actions/media-actions";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { MediaPickerShell, type PickerItem } from "@/components/media/media-picker-shell";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";

type MediaItem = {
  id: string;
  filename: string;
  urls: Record<string, string | null>;
  originalWidth: number;
  originalHeight: number;
  focalX: number | null;
  focalY: number | null;
  isLinked: boolean;
};

type Entity = {
  id: string;
  label: string;
};

type DetailMediaPickerSheetProps = {
  personId: string;
  referenceSessionId: string;
  category: CategoryWithGroup;
  entities?: Entity[];
  preselectedEntityId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
};

const ENTITY_FIELD_MAP: Record<string, "bodyMarkId" | "bodyModificationId"> = {
  BodyMark: "bodyMarkId",
  BodyModification: "bodyModificationId",
};

function toPickerItem(item: MediaItem): PickerItem {
  const u = item.urls;
  return {
    id: item.id,
    thumbUrl: u.gallery_512 ?? u.master_4000 ?? u.original ?? "",
    previewUrl: u.full_2400 ?? u.view_1200 ?? u.gallery_512 ?? u.original ?? "",
    zoomUrl: u.master_4000 ?? u.full_2400 ?? null,
    focalX: item.focalX,
    focalY: item.focalY,
    caption: item.filename,
    width: item.originalWidth || null,
    height: item.originalHeight || null,
  };
}

export function DetailMediaPickerSheet({
  personId,
  referenceSessionId,
  category,
  entities,
  preselectedEntityId,
  open,
  onOpenChange,
  onLinked,
}: DetailMediaPickerSheetProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialLinked, setInitialLinked] = useState<Set<string>>(new Set());
  const [selectedEntityId, setSelectedEntityId] = useState<string>(preselectedEntityId ?? "");
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  // Load reference-session media when sheet opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/sessions/${referenceSessionId}/media?personId=${personId}&categoryId=${category.id}`)
      .then((res) => res.json())
      .then((data: MediaItem[]) => {
        setItems(data);
        const linked = new Set(data.filter((d) => d.isLinked).map((d) => d.id));
        setSelected(linked);
        setInitialLinked(linked);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, personId, referenceSessionId, category.id]);

  const handleConfirm = useCallback((ids: string[]) => {
    const selSet = new Set(ids);
    const toLink = ids.filter((id) => !initialLinked.has(id));
    const toUnlink = [...initialLinked].filter((id) => !selSet.has(id));

    if (toLink.length === 0 && toUnlink.length === 0) {
      onOpenChange(false);
      return;
    }
    const entityField = category.entityModel ? ENTITY_FIELD_MAP[category.entityModel] : undefined;
    startTransition(async () => {
      if (toLink.length > 0) {
        await linkMediaToDetailCategoryAction(personId, toLink, category.id, entityField, selectedEntityId || undefined);
      }
      if (toUnlink.length > 0) {
        await unlinkMediaFromDetailCategoryAction(personId, toUnlink, category.id);
      }
      onLinked?.();
      onOpenChange(false);
    });
  }, [initialLinked, personId, category, selectedEntityId, onLinked, onOpenChange]);

  const handleUpload = useCallback(
    async (files: FileList) => {
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("sessionId", referenceSessionId);
          formData.append("personId", personId);

          let res = await fetch("/api/media/upload", { method: "POST", body: formData });
          if (!res.ok) continue;
          let json = (await res.json()) as {
            mediaItem?: { id: string; filename: string; urls: Record<string, string | null> };
            duplicateFound?: boolean;
          };
          if (json.duplicateFound && !json.mediaItem) {
            const retryForm = new FormData();
            retryForm.append("file", file);
            retryForm.append("sessionId", referenceSessionId);
            retryForm.append("personId", personId);
            retryForm.append("duplicateAction", "accept");
            res = await fetch("/api/media/upload", { method: "POST", body: retryForm });
            if (!res.ok) continue;
            json = await res.json();
          }
          if (json.mediaItem) {
            const mi = json.mediaItem;
            const newItem: MediaItem = {
              id: mi.id, filename: mi.filename, urls: mi.urls,
              originalWidth: 0, originalHeight: 0, focalX: null, focalY: null, isLinked: false,
            };
            setItems((prev) => [newItem, ...prev]);
            setSelected((prev) => new Set([...prev, mi.id]));
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [referenceSessionId, personId],
  );

  const pickerItems = useMemo(() => items.map(toPickerItem), [items]);

  const hasChanges =
    [...selected].some((id) => !initialLinked.has(id)) ||
    [...initialLinked].some((id) => !selected.has(id));

  if (!open) return null;

  const uploadSlot = (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-2.5 text-xs text-zinc-300 transition-colors hover:border-white/40 hover:text-white",
        uploading && "pointer-events-none opacity-60",
      )}
    >
      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
      {uploading ? "Uploading…" : "Upload new photos"}
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleUpload(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );

  const footerExtras =
    category.entityModel && entities && entities.length > 0 ? (
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-300">
          Link to specific {category.entityModel === "BodyMark" ? "body mark" : category.entityModel === "BodyModification" ? "modification" : "procedure"}
        </label>
        <EntityCombobox
          entities={entities.map((e) => ({ id: e.id, label: e.label }))}
          value={selectedEntityId}
          onChange={setSelectedEntityId}
          placeholder="None (category only)"
          emptyLabel="None (category only)"
        />
      </div>
    ) : undefined;

  return (
    <MediaPickerShell
      title={`${category.name} · ${category.groupName}`}
      items={pickerItems}
      loading={loading}
      onClose={() => onOpenChange(false)}
      selectionMode="multi"
      selectedIds={Array.from(selected)}
      onSelectionChange={(ids) => setSelected(new Set(ids))}
      onConfirm={handleConfirm}
      confirmLabel={isPending ? "Saving…" : "Save changes"}
      confirmDisabled={isPending || !hasChanges}
      uploadSlot={uploadSlot}
      footerExtras={footerExtras}
    />
  );
}
