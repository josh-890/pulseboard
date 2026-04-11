"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Clapperboard,
  Film,
  FolderSearch,
  GripVertical,
  Loader2,
  Unlink,
  Plus,
  Scissors,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { SortableGallery } from "@/components/gallery/sortable-gallery";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext, ProductionContext } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { MediaPickerSheet } from "@/components/sets/media-picker-sheet";
import { SessionStatusBadge } from "@/components/sessions/session-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  setSetCover,
  deleteSetMediaAction,
  removeMediaFromSetAction,
  reorderSetMediaAction,
  splitMediaToSessionAction,
} from "@/lib/actions/set-actions";
import { searchSessionsAction, createSession } from "@/lib/actions/session-actions";
import type { GalleryItem } from "@/lib/types";
import type { SessionStatus } from "@/lib/types";
import { applyGallerySort, GALLERY_SORT_OPTIONS } from "@/lib/gallery-sort";
import type { GallerySortMode } from "@/lib/gallery-sort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClipGroup = {
  ref: string | null;
  items: GalleryItem[];
};

type SessionGroup = {
  sessionId: string | null;
  sessionName: string;
  sessionDate: Date | null;
  isPrimary: boolean;
  items: GalleryItem[];
};

type SessionLink = {
  sessionId: string;
  sessionName: string;
  sessionDate: Date | null;
  isPrimary: boolean;
};

type SplitSearchResult = {
  id: string;
  name: string;
  status: SessionStatus;
  date: Date | null;
  datePrecision: string;
  _count: {
    mediaItems: number;
    contributions: number;
    setSessionLinks: number;
  };
};

type BlockedItem = {
  mediaItemId: string;
  filename: string;
  skillEventCount: number;
};

type SetDetailGalleryProps = {
  items: GalleryItem[];
  entityId: string;
  primarySessionId?: string;
  coverMediaItemId?: string | null;
  productionContext?: ProductionContext;
  setType?: "photo" | "video";
  isCompilation?: boolean;
  sessionLinks?: SessionLink[];
};

export function SetDetailGallery({
  items: initialItems,
  entityId,
  primarySessionId,
  coverMediaItemId: initialCoverId,
  productionContext,
  setType,
  isCompilation = false,
  sessionLinks,
}: SetDetailGalleryProps) {
  const [coverId, setCoverId] = useState(initialCoverId ?? null);
  const [localItems, setLocalItems] = useState(initialItems);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isReordering, setIsReordering] = useState(false);
  const [isGroupBySession, setIsGroupBySession] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>(() => {
    if (typeof window === "undefined") return "user";
    return (localStorage.getItem("gallery_sort_set") as GallerySortMode) ?? "user";
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Split-to-Session dialog state
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitQuery, setSplitQuery] = useState("");
  const [splitResults, setSplitResults] = useState<SplitSearchResult[]>([]);
  const [splitSearching, setSplitSearching] = useState(false);
  const [splitSelected, setSplitSelected] = useState<SplitSearchResult | null>(null);
  const [splitBlocked, setSplitBlocked] = useState<BlockedItem[]>([]);
  const [splitExecuting, setSplitExecuting] = useState(false);

  // Split dialog: "create new" mode
  const [splitMode, setSplitMode] = useState<"search" | "create">("search");
  const [newSessionName, setNewSessionName] = useState("");

  const [, startTransition] = useTransition();
  const dragCounterRef = useRef(0);
  const addFilesRef = useRef<((files: FileList | File[]) => void) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const splitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local items when server re-renders with new data
  useEffect(() => {
    setLocalItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    fetch("/api/collections/list")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => setCollections(data))
      .catch(() => {});
  }, []);

  // Drag-anywhere overlay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes("Files")) setIsDragOver(true);
    }
    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    }
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer?.files.length) addFilesRef.current?.(e.dataTransfer.files);
    }

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, []);

  // Split dialog: debounced session search
  useEffect(() => {
    if (!splitDialogOpen || !splitQuery.trim()) {
      setSplitResults([]);
      return;
    }
    if (splitDebounceRef.current) clearTimeout(splitDebounceRef.current);
    splitDebounceRef.current = setTimeout(async () => {
      setSplitSearching(true);
      const res = await searchSessionsAction(splitQuery);
      setSplitResults(res.filter((r) => r.id !== primarySessionId));
      setSplitSearching(false);
    }, 300);
    return () => {
      if (splitDebounceRef.current) clearTimeout(splitDebounceRef.current);
    };
  }, [splitQuery, splitDialogOpen, primarySessionId]);

  // Reset split dialog state when closed
  useEffect(() => {
    if (!splitDialogOpen) {
      setSplitQuery("");
      setSplitResults([]);
      setSplitSelected(null);
      setSplitBlocked([]);
      setSplitMode("search");
      setNewSessionName("");
    }
  }, [splitDialogOpen]);

  // Merge cover flag into local items, then apply sort
  const items = useMemo(
    () =>
      applyGallerySort(
        localItems.map((item) => ({ ...item, isCover: item.id === coverId })),
        sortMode,
      ),
    [localItems, coverId, sortMode],
  );

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [items]);

  // True when gallery items actually span multiple sessions (drives "Group by session" visibility)
  const hasMultipleSessions = useMemo(() => {
    const ids = new Set(items.map((i) => i.sessionId).filter((id): id is string => !!id));
    return ids.size > 1;
  }, [items]);

  // For video sets: group items by sourceVideoRef, sorted by timecode within each group
  const isVideoSet = setType === "video";
  const clipGroups = useMemo<ClipGroup[]>(() => {
    if (!isVideoSet) return [];
    const hasAnyRef = items.some((i) => i.sourceVideoRef);
    if (!hasAnyRef) return [{ ref: null, items: [...items] }];

    const groupMap = new Map<string, GalleryItem[]>();
    const ungrouped: GalleryItem[] = [];
    for (const item of items) {
      if (item.sourceVideoRef) {
        const group = groupMap.get(item.sourceVideoRef) ?? [];
        group.push(item);
        groupMap.set(item.sourceVideoRef, group);
      } else {
        ungrouped.push(item);
      }
    }
    const groups: ClipGroup[] = [];
    for (const [ref, groupItems] of groupMap) {
      const sorted = [...groupItems].sort(
        (a, b) => (a.sourceTimecodeMs ?? Infinity) - (b.sourceTimecodeMs ?? Infinity),
      );
      groups.push({ ref, items: sorted });
    }
    if (ungrouped.length > 0) groups.push({ ref: null, items: ungrouped });
    return groups;
  }, [isVideoSet, items]);

  // Session-grouped view for any set with multi-session media (only when sortMode === "user")
  const sessionGroups = useMemo<SessionGroup[]>(() => {
    if (!isGroupBySession || sortMode !== "user") return [];

    const sessionInfoMap = new Map<string, SessionLink>(
      (sessionLinks ?? []).map((l) => [l.sessionId, l]),
    );

    const groupMap = new Map<string, GalleryItem[]>();
    const ungrouped: GalleryItem[] = [];
    for (const item of items) {
      if (item.sessionId) {
        const group = groupMap.get(item.sessionId) ?? [];
        group.push(item);
        groupMap.set(item.sessionId, group);
      } else {
        ungrouped.push(item);
      }
    }

    const groups: SessionGroup[] = [];
    for (const [sessionId, groupItems] of groupMap) {
      const info = sessionInfoMap.get(sessionId);
      groups.push({
        sessionId,
        sessionName: info?.sessionName ?? groupItems[0]?.sessionName ?? "Unknown Session",
        sessionDate: info?.sessionDate ?? null,
        isPrimary: info?.isPrimary ?? false,
        items: groupItems,
      });
    }

    // Sort by date ascending (oldest first); undated sessions go last
    groups.sort((a, b) => {
      if (a.sessionDate && b.sessionDate) {
        return a.sessionDate.getTime() - b.sessionDate.getTime();
      }
      if (a.sessionDate && !b.sessionDate) return -1;
      if (!a.sessionDate && b.sessionDate) return 1;
      return 0;
    });

    if (ungrouped.length > 0) {
      groups.push({
        sessionId: null,
        sessionName: "Unassigned",
        sessionDate: null,
        isPrimary: false,
        items: ungrouped,
      });
    }

    return groups;
  }, [isCompilation, isGroupBySession, sortMode, sessionLinks, items]);

  const handleSetCover = useCallback(
    (mediaItemId: string | null) => {
      setCoverId(mediaItemId);
      setSetCover(entityId, mediaItemId);
    },
    [entityId],
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleDeleteConfirm = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);
    setDeleteDialogOpen(false);
    setLocalItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
    clearSelection();
    startTransition(async () => {
      await deleteSetMediaAction(entityId, primarySessionId ?? "", idsToDelete);
    });
  }, [selectedIds, entityId, primarySessionId, clearSelection]);

  const handleLightboxDelete = useCallback(
    (id: string) => {
      setLocalItems((prev) => prev.filter((it) => it.id !== id));
      setLightboxIndex(null);
      startTransition(async () => {
        await deleteSetMediaAction(entityId, primarySessionId ?? "", [id]);
      });
    },
    [entityId, primarySessionId],
  );

  const handleRemoveFromSet = useCallback(() => {
    const idsToRemove = Array.from(selectedIds);
    setLocalItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
    clearSelection();
    startTransition(async () => {
      const result = await removeMediaFromSetAction(entityId, idsToRemove);
      if (!result.success) toast.error(result.error ?? "Failed to remove from set");
    });
  }, [selectedIds, entityId, clearSelection]);

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      const idSet = new Map(localItems.map((it) => [it.id, it]));
      setLocalItems(
        orderedIds
          .map((id) => idSet.get(id))
          .filter((it): it is GalleryItem => it !== undefined),
      );
      startTransition(async () => {
        await reorderSetMediaAction(entityId, orderedIds);
      });
    },
    [localItems, entityId],
  );

  const handleSortChange = useCallback((mode: GallerySortMode) => {
    setSortMode(mode);
    localStorage.setItem("gallery_sort_set", mode);
    if (mode !== "user") setIsReordering(false);
  }, []);

  async function handleSplit() {
    if (!splitSelected) return;
    setSplitExecuting(true);
    const result = await splitMediaToSessionAction(
      entityId,
      primarySessionId ?? "",
      Array.from(selectedIds),
      splitSelected.id,
    );
    setSplitExecuting(false);

    if (result.success) {
      toast.success(
        `Moved ${selectedIds.size} photo${selectedIds.size !== 1 ? "s" : ""} to "${splitSelected.name}"`,
      );
      setSplitDialogOpen(false);
      clearSelection();
    } else if ("blockedItems" in result && result.blockedItems && result.blockedItems.length > 0) {
      setSplitBlocked(result.blockedItems);
      setSplitSelected(null);
    } else {
      toast.error(result.error ?? "Failed to move photos");
    }
  }

  const collectionContext = useMemo<CollectionContext | undefined>(
    () => (collections.length > 0 ? { collections } : undefined),
    [collections],
  );

  const hasSelection = selectedIds.size > 0;
  const showSessionGroups = isGroupBySession && sortMode === "user" && sessionGroups.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {items.length > 0 &&
        (isReordering ? (
          <SortableGallery
            items={items}
            onReorder={handleReorder}
            onOpen={(id) => {
              const idx = indexMap.get(id);
              if (idx !== undefined) setLightboxIndex(idx);
            }}
          />
        ) : isVideoSet && clipGroups.length > 0 ? (
          clipGroups.map((group) => (
            <div key={group.ref ?? "__ungrouped"} className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Film size={13} className="text-violet-400 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {group.ref ?? "No clip name"}
                </span>
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  ({group.items.length} {group.items.length === 1 ? "frame" : "frames"})
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <JustifiedGrid
                items={group.items}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onOpen={(id) => {
                  const idx = indexMap.get(id);
                  if (idx !== undefined) setLightboxIndex(idx);
                }}
              />
            </div>
          ))
        ) : showSessionGroups ? (
          sessionGroups.map((group) => (
            <div key={group.sessionId ?? "__unassigned"} className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <Clapperboard size={13} className="text-sky-400 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {group.sessionName}
                  {group.isPrimary && (
                    <span className="ml-1 text-muted-foreground/50">(host)</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  · {group.items.length} {group.items.length === 1 ? "photo" : "photos"}
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <JustifiedGrid
                items={group.items}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onOpen={(id) => {
                  const idx = indexMap.get(id);
                  if (idx !== undefined) setLightboxIndex(idx);
                }}
              />
            </div>
          ))
        ) : (
          <JustifiedGrid
            items={items}
            selectable
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onOpen={(id) => {
              const idx = indexMap.get(id);
              if (idx !== undefined) setLightboxIndex(idx);
            }}
          />
        ))}

      {/* Action bar */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {hasSelection ? (
          <>
            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 size={14} />
              Delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleRemoveFromSet}
              title="Remove from this set without deleting the media"
            >
              <Unlink size={14} />
              Remove from set
            </Button>
            {isCompilation && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSplitDialogOpen(true)}
              >
                <Scissors size={14} />
                Split to Session
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearSelection}>
              <X size={14} />
              Clear
            </Button>
          </>
        ) : (
          <>
            {primarySessionId && !isReordering && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>(
                    'input[type="file"][accept*="image"]',
                  );
                  input?.click();
                }}
              >
                <Plus size={14} />
                Upload
              </Button>
            )}
            {!isReordering && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPickerOpen(true)}
              >
                <FolderSearch size={14} />
                Browse & Add
              </Button>
            )}
            {hasMultipleSessions && !isReordering && !isVideoSet && (
              <Button
                variant={showSessionGroups ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (sortMode !== "user") handleSortChange("user");
                  setIsGroupBySession((v) => !v);
                }}
              >
                <Clapperboard size={14} />
                Group by session
              </Button>
            )}
            <Select value={sortMode} onValueChange={handleSortChange}>
              <SelectTrigger className="h-7 w-[130px] text-xs gap-1 ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {items.length > 1 && sortMode === "user" && (
              <Button
                variant={isReordering ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setIsReordering((v) => !v)}
              >
                <GripVertical size={14} />
                {isReordering ? "Done" : "Reorder"}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Headless upload engine */}
      {primarySessionId && (
        <BatchUploadZone
          sessionId={primarySessionId}
          setId={entityId}
          hideDropzone
          addFilesRef={addFilesRef}
          videoSetMode={isVideoSet}
        />
      )}

      {/* Drag-anywhere overlay */}
      {isDragOver && !isReordering && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-entity-set/50 bg-entity-set/5 backdrop-blur-[2px] transition-all">
          <div className="flex flex-col items-center gap-2">
            <Upload size={28} className="text-entity-set/60" />
            <p className="text-sm font-medium text-entity-set/80">Drop to upload</p>
          </div>
        </div>
      )}

      <MediaPickerSheet
        setId={entityId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sessionLinks={sessionLinks?.map((l) => ({ sessionId: l.sessionId, sessionName: l.sessionName }))}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} {selectedIds.size === 1 ? "item" : "items"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {selectedIds.size === 1 ? "file" : "files"} and all
              associated metadata. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Split-to-Session dialog */}
      <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Split to Session</DialogTitle>
            <DialogDescription>
              Move {selectedIds.size} selected photo{selectedIds.size !== 1 ? "s" : ""} to a
              different production session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {splitBlocked.length > 0 ? (
              /* Blocked items error */
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    Cannot move {splitBlocked.length}{" "}
                    {splitBlocked.length === 1 ? "photo" : "photos"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    These photos are linked to skill events. Remove the skill event links first, then
                    retry.
                  </p>
                </div>
                <ul className="max-h-48 overflow-y-auto space-y-1">
                  {splitBlocked.map((b) => (
                    <li
                      key={b.mediaItemId}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm"
                    >
                      <span className="truncate font-medium">{b.filename}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {b.skillEventCount} skill event{b.skillEventCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setSplitBlocked([])}
                >
                  Back to session search
                </Button>
              </div>
            ) : !splitSelected ? (
              /* Session pick or create */
              <>
                {/* Mode toggle */}
                <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setSplitMode("search")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      splitMode === "search"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Pick existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMode("create")}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      splitMode === "create"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Create new
                  </button>
                </div>

                {splitMode === "search" ? (
                  <>
                    <div className="relative">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        placeholder="Search sessions..."
                        value={splitQuery}
                        onChange={(e) => setSplitQuery(e.target.value)}
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {splitSearching && (
                        <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                          <Loader2 size={14} className="animate-spin" />
                          Searching…
                        </div>
                      )}
                      {!splitSearching && splitQuery.trim() && splitResults.length === 0 && (
                        <p className="py-2 text-center text-sm text-muted-foreground">No sessions found.</p>
                      )}
                      {!splitSearching && !splitQuery.trim() && (
                        <p className="py-2 text-center text-sm text-muted-foreground">Type to search for a session.</p>
                      )}
                      {splitResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSplitSelected(r)}
                          className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{r.name}</span>
                            <SessionStatusBadge status={r.status} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {r._count.mediaItems} media · {r._count.contributions} contributions
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Create new session inline */
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Session name</label>
                      <Input
                        placeholder="e.g. On-set BTS — March 2024"
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!newSessionName.trim() || splitExecuting}
                      onClick={async () => {
                        setSplitExecuting(true);
                        const created = await createSession({ name: newSessionName.trim(), status: "DRAFT" });
                        if (!created.success || !("id" in created)) {
                          toast.error("Failed to create session");
                          setSplitExecuting(false);
                          return;
                        }
                        const result = await splitMediaToSessionAction(
                          entityId,
                          primarySessionId ?? "",
                          Array.from(selectedIds),
                          created.id,
                        );
                        setSplitExecuting(false);
                        if (result.success) {
                          toast.success(
                            `Moved ${selectedIds.size} photo${selectedIds.size !== 1 ? "s" : ""} to new session "${newSessionName.trim()}"`,
                          );
                          setSplitDialogOpen(false);
                          clearSelection();
                        } else if ("blockedItems" in result && result.blockedItems && result.blockedItems.length > 0) {
                          setSplitBlocked(result.blockedItems);
                          setSplitMode("search");
                        } else {
                          toast.error(result.error ?? "Failed to move photos");
                        }
                      }}
                    >
                      {splitExecuting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                      Create session &amp; move photos
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Confirm move */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Move {selectedIds.size} photo{selectedIds.size !== 1 ? "s" : ""} to:
                </p>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{splitSelected.name}</span>
                    <SessionStatusBadge status={splitSelected.status} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => setSplitSelected(null)}
                  >
                    Change
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={splitExecuting}
                    onClick={handleSplit}
                  >
                    {splitExecuting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                    Confirm Move
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSetCover={handleSetCover}
          coverMediaItemId={coverId}
          onFindSimilar={(mediaItemId) => window.open(`/media/similar?id=${mediaItemId}`, "_blank")}
          onDelete={handleLightboxDelete}
          sessionId={primarySessionId}
          productionContext={productionContext}
          collectionContext={collectionContext}
        />
      )}
    </div>
  );
}
