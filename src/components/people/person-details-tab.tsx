"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ImageIcon, Layers, Plus, ScanSearch, Upload } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";
import type { GalleryItem, PersonCurrentState } from "@/lib/types";
import { DetailMediaPickerSheet } from "@/components/people/detail-media-picker-sheet";
import { CrossSessionPicker } from "@/components/media/cross-session-picker";
import { AnnotationEditor } from "@/components/media/annotation-editor";
import { StagePhotoDialog } from "@/components/media/stage-photo-dialog";
import { linkMediaToDetailCategoryAction, copyMediaItemToReferenceAction } from "@/lib/actions/media-actions";

type CategoryCount = {
  categoryId: string;
  count: number;
};

type CategoryMediaItem = {
  id: string;
  filename: string;
  urls: Record<string, string | null>;
  originalWidth: number;
  originalHeight: number;
  focalX: number | null;
  focalY: number | null;
};

type PersonDetailsTabProps = {
  personId: string;
  categories: CategoryWithGroup[];
  categoryCounts: CategoryCount[];
  referenceSessionId?: string;
  currentState?: PersonCurrentState;
};

export function PersonDetailsTab({
  personId,
  categories,
  categoryCounts,
  referenceSessionId,
  currentState,
}: PersonDetailsTabProps) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [categoryMedia, setCategoryMedia] = useState<Map<string, CategoryMediaItem[]>>(new Map());
  const [, startLoadingTransition] = useTransition();
  const [pickerCategory, setPickerCategory] = useState<CategoryWithGroup | null>(null);

  // Cross-session picker + stage dialog + annotation editor state
  type CrossPickerState = { category: CategoryWithGroup }
  type StagedPhoto = { item: GalleryItem; category: CategoryWithGroup }
  type AnnotateState = { item: GalleryItem; category: CategoryWithGroup; editorMode?: 'arrow' | 'crop' }
  const [crossPicker, setCrossPicker] = useState<CrossPickerState | null>(null);
  const [stagedPhoto, setStagedPhoto] = useState<StagedPhoto | null>(null);
  const [isStagingCopy, setIsStagingCopy] = useState(false);
  const [annotateState, setAnnotateState] = useState<AnnotateState | null>(null);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const cc of categoryCounts) {
      map.set(cc.categoryId, cc.count);
    }
    return map;
  }, [categoryCounts]);

  // Group categories by group
  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, { groupName: string; items: (CategoryWithGroup & { count: number })[] }>();
    for (const cat of categories) {
      const count = countMap.get(cat.id) ?? 0;
      if (!showAll && count === 0) continue;
      if (!grouped.has(cat.groupId)) {
        grouped.set(cat.groupId, { groupName: cat.groupName, items: [] });
      }
      grouped.get(cat.groupId)!.items.push({ ...cat, count });
    }
    return Array.from(grouped.values()).filter((g) => g.items.length > 0);
  }, [categories, countMap, showAll]);

  const populatedCount = useMemo(
    () => categories.filter((c) => (countMap.get(c.id) ?? 0) > 0).length,
    [categories, countMap],
  );

  const handleToggleExpand = useCallback(
    (categoryId: string) => {
      if (expandedCategoryId === categoryId) {
        setExpandedCategoryId(null);
        return;
      }
      setExpandedCategoryId(categoryId);
      // Load media for the expanded category if not already loaded
      if (!categoryMedia.has(categoryId)) {
        startLoadingTransition(async () => {
          const res = await fetch(`/api/categories/${categoryId}/media?personId=${personId}`);
          if (res.ok) {
            const data = await res.json() as CategoryMediaItem[];
            setCategoryMedia((prev) => {
              const next = new Map(prev);
              next.set(categoryId, data);
              return next;
            });
          }
        });
      }
    },
    [personId, categoryMedia, expandedCategoryId],
  );

  const getEntitiesForCategory = useCallback(
    (cat: CategoryWithGroup) => {
      if (!currentState || !cat.entityModel) return undefined;
      if (cat.entityModel === "BodyMark") {
        return currentState.activeBodyMarks.map((m) => ({
          id: m.id,
          label: `${m.type} — ${m.bodyRegion}`,
        }));
      }
      if (cat.entityModel === "BodyModification") {
        return currentState.activeBodyModifications.map((m) => ({
          id: m.id,
          label: `${m.type} — ${m.bodyRegion}`,
        }));
      }
      if (cat.entityModel === "CosmeticProcedure") {
        return currentState.activeCosmeticProcedures.map((m) => ({
          id: m.id,
          label: `${m.type} — ${m.bodyRegion}`,
        }));
      }
      return undefined;
    },
    [currentState],
  );

  const handlePickerLinked = useCallback(() => {
    // Clear cached media for the picker category so it reloads
    if (pickerCategory) {
      setCategoryMedia((prev) => {
        const next = new Map(prev);
        next.delete(pickerCategory.id);
        return next;
      });
    }
    router.refresh();
  }, [pickerCategory, router]);

  const refreshCategory = useCallback((categoryId: string) => {
    setCategoryMedia((prev) => {
      const next = new Map(prev);
      next.delete(categoryId);
      return next;
    });
    router.refresh();
  }, [router]);

  // Cross-session picker: user selected a photo → always stage first
  const handleCrossPickerSelect = useCallback((item: GalleryItem) => {
    if (!crossPicker) return;
    setStagedPhoto({ item, category: crossPicker.category });
    setCrossPicker(null);
  }, [crossPicker]);

  // Stage dialog: "Save as copy"
  const handleStageSaveCopy = useCallback(async () => {
    if (!stagedPhoto || !referenceSessionId) return;
    setIsStagingCopy(true);
    try {
      const result = await copyMediaItemToReferenceAction(
        stagedPhoto.item.id,
        personId,
        referenceSessionId,
      );
      if (result.success && result.newMediaItemId) {
        await linkMediaToDetailCategoryAction(personId, [result.newMediaItemId], stagedPhoto.category.id);
        refreshCategory(stagedPhoto.category.id);
      }
    } finally {
      setStagedPhoto(null);
      setIsStagingCopy(false);
    }
  }, [stagedPhoto, referenceSessionId, personId, refreshCategory]);

  // Annotation editor: user saved blob
  const handleAnnotationSave = useCallback(async (blob: Blob) => {
    if (!referenceSessionId || !annotateState) return;
    const { category } = annotateState;
    setIsSavingAnnotation(true);
    try {
      const file = new File([blob], `annotation-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', referenceSessionId);
      formData.append('personId', personId);
      formData.append('isAnnotation', 'true');

      let res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      let json = await res.json() as { mediaItem?: { id: string }; duplicateFound?: boolean };

      if (json.duplicateFound && !json.mediaItem) {
        const retry = new FormData();
        retry.append('file', file);
        retry.append('sessionId', referenceSessionId);
        retry.append('personId', personId);
        retry.append('isAnnotation', 'true');
        retry.append('duplicateAction', 'accept');
        res = await fetch('/api/media/upload', { method: 'POST', body: retry });
        json = await res.json();
      }

      if (json.mediaItem?.id) {
        await linkMediaToDetailCategoryAction(personId, [json.mediaItem.id], category.id);
        refreshCategory(category.id);
      }
    } finally {
      setIsSavingAnnotation(false);
      setAnnotateState(null);
    }
  }, [referenceSessionId, personId, annotateState, refreshCategory]);

  // ─── Drop-to-upload for non-entity categories ─────────────────────────────
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const handleCategoryDrop = useCallback(
    async (categoryId: string, files: FileList) => {
      if (!referenceSessionId) return;

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", referenceSessionId);
        formData.append("personId", personId);

        try {
          let res = await fetch("/api/media/upload", { method: "POST", body: formData });
          let json = await res.json();

          // Auto-accept duplicates
          if (json.duplicateFound && !json.mediaItem) {
            const retryForm = new FormData();
            retryForm.append("file", file);
            retryForm.append("sessionId", referenceSessionId);
            retryForm.append("personId", personId);
            retryForm.append("duplicateAction", "accept");
            res = await fetch("/api/media/upload", { method: "POST", body: retryForm });
            json = await res.json();
          }

          if (!json.mediaItem?.id) continue;

          await linkMediaToDetailCategoryAction(
            personId,
            [json.mediaItem.id],
            categoryId,
          );
        } catch {
          // Upload failed silently
        }
      }

      // Refresh cached media for this category + counts
      setCategoryMedia((prev) => {
        const next = new Map(prev);
        next.delete(categoryId);
        return next;
      });
      router.refresh();
    },
    [referenceSessionId, personId, router],
  );

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <p className="text-sm text-muted-foreground italic">
          No categories configured. Add categories in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {populatedCount} of {categories.length} categories have photos
        </p>
        <button
          type="button"
          onClick={() => setShowAll((p) => !p)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            showAll
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground hover:bg-muted/80",
          )}
        >
          {showAll ? "Show populated only" : "Show all categories"}
        </button>
      </div>

      {categoryGroups.length === 0 && !showAll && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
          <p className="text-sm text-muted-foreground italic">
            No categories have photos yet.
          </p>
        </div>
      )}

      {/* Category groups */}
      {categoryGroups.map((group) => (
        <div
          key={group.groupName}
          className="rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm overflow-hidden"
        >
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            <Layers size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">{group.groupName}</h3>
          </div>

          <div className="divide-y divide-white/5">
            {group.items.map((cat) => {
              const isExpanded = expandedCategoryId === cat.id;
              const media = categoryMedia.get(cat.id);

              const canDrop = !!referenceSessionId && !cat.entityModel;
              const isDragOver = dragOverCategoryId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="relative"
                  onDragEnter={canDrop ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounterRef.current++;
                    if (e.dataTransfer.types.includes("Files")) setDragOverCategoryId(cat.id);
                  } : undefined}
                  onDragOver={canDrop ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                  onDragLeave={canDrop ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounterRef.current--;
                    if (dragCounterRef.current <= 0) {
                      dragCounterRef.current = 0;
                      setDragOverCategoryId(null);
                    }
                  } : undefined}
                  onDrop={canDrop ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounterRef.current = 0;
                    setDragOverCategoryId(null);
                    if (e.dataTransfer.files.length > 0) handleCategoryDrop(cat.id, e.dataTransfer.files);
                  } : undefined}
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => cat.count > 0 ? handleToggleExpand(cat.id) : undefined}
                      disabled={cat.count === 0 && !referenceSessionId}
                      className={cn(
                        "flex flex-1 items-center gap-3 px-5 py-3 text-left transition-colors",
                        cat.count > 0
                          ? "hover:bg-muted/30 cursor-pointer"
                          : "opacity-50 cursor-default",
                      )}
                    >
                      {cat.count > 0 ? (
                        isExpanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="flex-1 text-sm font-medium">{cat.name}</span>
                      {cat.entityModel && (
                        <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {cat.entityModel}
                        </span>
                      )}
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        cat.count > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/40 text-muted-foreground",
                      )}>
                        {cat.count}
                      </span>
                    </button>
                    <div className="shrink-0 mr-3 flex items-center gap-0.5">
                      {referenceSessionId && !cat.entityModel && (
                        <button
                          type="button"
                          onClick={() => setPickerCategory(cat)}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10"
                          title="Add from reference session"
                          aria-label={`Add photo from reference session for ${cat.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                      {!cat.entityModel && (
                        <button
                          type="button"
                          onClick={() => setCrossPicker({ category: cat })}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-indigo-400 hover:bg-indigo-500/10"
                          title="Select from any session"
                          aria-label={`Select photo from any session for ${cat.name}`}
                        >
                          <ScanSearch size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded gallery */}
                  {isExpanded && (
                    <div className="border-t border-white/5 bg-muted/10 px-5 py-4">
                      {!media ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                          Loading...
                        </div>
                      ) : media.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No photos</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                          {media.map((item) => {
                            const thumbUrl = item.urls.gallery_512 ?? item.urls.original;
                            return (
                              <div
                                key={item.id}
                                className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-muted/30"
                              >
                                {thumbUrl ? (
                                  <Image
                                    src={thumbUrl}
                                    alt={item.filename}
                                    width={item.originalWidth}
                                    height={item.originalHeight}
                                    unoptimized
                                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                    style={focalStyle(item.focalX, item.focalY)}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <ImageIcon size={20} className="text-muted-foreground/40" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Drop overlay */}
                  {isDragOver && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary/50 bg-primary/10 backdrop-blur-[1px]">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Upload size={14} />
                        Drop to upload to {cat.name}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Detail media picker sheet */}
      {pickerCategory && referenceSessionId && (
        <DetailMediaPickerSheet
          personId={personId}
          referenceSessionId={referenceSessionId}
          category={pickerCategory}
          entities={getEntitiesForCategory(pickerCategory)}
          open={!!pickerCategory}
          onOpenChange={(open) => { if (!open) setPickerCategory(null); }}
          onLinked={handlePickerLinked}
        />
      )}

      {/* Cross-session picker */}
      {crossPicker && (
        <CrossSessionPicker
          personId={personId}
          onSelect={handleCrossPickerSelect}
          onClose={() => setCrossPicker(null)}
          title={`Select photo — ${crossPicker.category.name}`}
        />
      )}

      {/* Stage dialog */}
      {stagedPhoto && (
        <StagePhotoDialog
          item={stagedPhoto.item}
          entityLabel={stagedPhoto.category.name}
          onSaveCopy={handleStageSaveCopy}
          onCrop={() => {
            setAnnotateState({ item: stagedPhoto.item, category: stagedPhoto.category, editorMode: 'crop' });
            setStagedPhoto(null);
          }}
          onAnnotate={() => {
            setAnnotateState({ item: stagedPhoto.item, category: stagedPhoto.category });
            setStagedPhoto(null);
          }}
          onCancel={() => setStagedPhoto(null)}
          isSaving={isStagingCopy}
        />
      )}

      {/* Annotation editor */}
      {annotateState && (
        <AnnotationEditor
          imageUrl={
            annotateState.item.urls.view_1200 ??
            annotateState.item.urls.gallery_512 ??
            annotateState.item.urls.original ??
            ''
          }
          onSave={handleAnnotationSave}
          onCancel={() => setAnnotateState(null)}
          isSaving={isSavingAnnotation}
          initialTool={annotateState.editorMode}
        />
      )}
    </div>
  );
}
