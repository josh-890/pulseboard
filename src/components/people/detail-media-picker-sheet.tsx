"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { Check, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import {
  linkMediaToDetailCategoryAction,
  unlinkMediaFromDetailCategoryAction,
} from "@/lib/actions/media-actions";
import { EntityCombobox } from "@/components/shared/entity-combobox";
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

const ENTITY_FIELD_MAP: Record<string, "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId"> = {
  BodyMark: "bodyMarkId",
  BodyModification: "bodyModificationId",
  CosmeticProcedure: "cosmeticProcedureId",
};

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
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  useEscToClose(handleClose);

  // Load media when sheet opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/sessions/${referenceSessionId}/media?personId=${personId}&categoryId=${category.id}`)
      .then((res) => res.json())
      .then((data: MediaItem[]) => {
        setItems(data);
        const linked = new Set(data.filter((d) => d.isLinked).map((d) => d.id));
        setSelected(new Set(linked));
        setInitialLinked(new Set(linked));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, referenceSessionId, personId, category.id]);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const toLink = [...selected].filter((id) => !initialLinked.has(id));
    const toUnlink = [...initialLinked].filter((id) => !selected.has(id));

    if (toLink.length === 0 && toUnlink.length === 0) {
      onOpenChange(false);
      return;
    }

    const entityField = category.entityModel ? ENTITY_FIELD_MAP[category.entityModel] : undefined;

    startTransition(async () => {
      if (toLink.length > 0) {
        await linkMediaToDetailCategoryAction(
          personId,
          toLink,
          category.id,
          entityField,
          selectedEntityId || undefined,
        );
      }
      if (toUnlink.length > 0) {
        await unlinkMediaFromDetailCategoryAction(personId, toUnlink, category.id);
      }
      onLinked?.();
      onOpenChange(false);
    });
  }, [selected, initialLinked, personId, category, selectedEntityId, onLinked, onOpenChange]);

  const handleUpload = useCallback(
    async (files: FileList) => {
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("sessionId", referenceSessionId);
          formData.append("personId", personId);

          let res = await fetch("/api/media/upload", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) continue;

          let json = await res.json() as {
            mediaItem?: { id: string; filename: string; urls: Record<string, string | null> };
            duplicateFound?: boolean;
          };

          // Auto-accept duplicates in this context — re-submit with accept flag
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
              id: mi.id,
              filename: mi.filename,
              urls: mi.urls,
              originalWidth: 0,
              originalHeight: 0,
              focalX: null,
              focalY: null,
              isLinked: false,
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

  if (!open) return null;

  const hasChanges =
    [...selected].some((id) => !initialLinked.has(id)) ||
    [...initialLinked].some((id) => !selected.has(id));

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-lg bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {category.name}
            </h2>
            <p className="text-xs text-muted-foreground">{category.groupName}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {/* Upload zone */}
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/20 py-4 text-sm text-muted-foreground transition-colors hover:border-white/40 hover:text-foreground",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {uploading ? "Uploading..." : "Upload new photos"}
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

          {/* Entity selector */}
          {category.entityModel && entities && entities.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
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
          )}

          {/* Photo grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground italic">
              No photos in reference session. Upload some above.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                const thumbUrl =
                  item.urls.gallery_512 ?? item.urls.original;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-primary ring-1 ring-primary"
                        : "border-white/10 hover:border-white/30",
                    )}
                  >
                    {thumbUrl ? (
                      <Image
                        src={thumbUrl}
                        alt={item.filename}
                        width={item.originalWidth}
                        height={item.originalHeight}
                        unoptimized
                        className="h-full w-full object-cover"
                        style={focalStyle(item.focalX, item.focalY)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/30">
                        <ImageIcon size={20} className="text-muted-foreground/40" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="rounded-full bg-primary p-1">
                          <Check size={14} className="text-primary-foreground" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : hasChanges ? "Save Changes" : "No Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
