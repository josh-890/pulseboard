"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Camera,
  Upload,
  AlertCircle,
  Check,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonMediaUsage, DuplicateMatch } from "@/lib/types";
import { DuplicateReviewDialog } from "./duplicate-review-dialog";

type BatchUploadZoneProps = {
  sessionId: string;
  personId?: string;
  setId?: string;
  filledHeadshotSlots?: number[];
  totalHeadshotSlots?: number;
  onBatchComplete?: () => void;
  /** Hide the built-in dropzone UI. Use `addFilesRef` to trigger uploads externally. */
  hideDropzone?: boolean;
  /** Ref callback that exposes the `addFiles` function for external triggers (button, drag overlay). */
  addFilesRef?: React.Ref<((files: FileList | File[]) => void) | null>;
};

type FileStatus = "pending" | "uploading" | "complete" | "error" | "duplicate";

type UploadFile = {
  id: string;
  file: File;
  preview: string;
  status: FileStatus;
  progress: number;
  error?: string;
  sortOrder: number;
  usage?: PersonMediaUsage;
  slot?: number;
  duplicateMatches?: DuplicateMatch[];
  hash?: string;
  phash?: string;
};

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_SIZE = 25 * 1024 * 1024;
const MAX_CONCURRENT = 4;

function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) return `${file.name}: File size must be 25MB or less`;
  if (!ALLOWED_TYPES.has(file.type)) return `${file.name}: Must be JPEG, PNG, WebP, or GIF`;
  return null;
}

function computeMetadata(
  files: File[],
  personId?: string,
  setId?: string,
  filledSlots: number[] = [],
  totalSlots = 5,
): Pick<UploadFile, "usage" | "slot">[] {
  if (setId) {
    return files.map(() => ({ usage: "PORTFOLIO" as PersonMediaUsage }));
  }

  if (personId) {
    const allSlots = Array.from({ length: totalSlots }, (_, i) => i + 1);
    const emptySlots = allSlots.filter((s) => !filledSlots.includes(s));

    return files.map((_, i) => {
      if (i < emptySlots.length) {
        return {
          usage: "HEADSHOT" as PersonMediaUsage,
          slot: emptySlots[i],
        };
      }
      return { usage: "PROFILE" as PersonMediaUsage };
    });
  }

  return files.map(() => ({}));
}

export function BatchUploadZone({
  sessionId,
  personId,
  setId,
  filledHeadshotSlots = [],
  totalHeadshotSlots = 5,
  onBatchComplete,
  hideDropzone = false,
  addFilesRef,
}: BatchUploadZoneProps) {
  const router = useRouter();
  // Keep external ref in sync (called after addFiles is defined below)
  const [queue, setQueue] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  // Derive the current duplicate to review from the queue (first one wins)
  // This avoids the race where multiple concurrent uploads overwrite a single state value
  const duplicateFile = queue.find((f) => f.status === "duplicate") ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef(0);
  const abortControllersRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const dispatchedRef = useRef<Set<string>>(new Set());
  const processQueueRef = useRef<(q: UploadFile[]) => void>(() => {});

  const isUploading = queue.some(
    (f) => f.status === "uploading" || f.status === "pending",
  );

  const sendUpload = useCallback(
    (
      item: UploadFile,
      extraFields?: Record<string, string>,
    ) => {
      // Guard against double-dispatch (React Strict Mode / concurrent renders)
      if (dispatchedRef.current.has(item.id)) return;
      dispatchedRef.current.add(item.id);

      activeUploadsRef.current++;

      setQueue((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: "uploading" as const, progress: 0 } : f,
        ),
      );

      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("sessionId", sessionId);
      if (personId) formData.append("personId", personId);
      if (setId) formData.append("setId", setId);
      if (item.usage) formData.append("usage", item.usage);
      if (item.slot !== undefined) formData.append("slot", String(item.slot));
      formData.append("sortOrder", String(item.sortOrder));

      // Extra fields for duplicate action
      if (extraFields) {
        for (const [key, value] of Object.entries(extraFields)) {
          formData.append(key, value);
        }
      }

      const xhr = new XMLHttpRequest();
      abortControllersRef.current.set(item.id, xhr);
      xhr.open("POST", "/api/media/upload");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setQueue((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, progress: pct } : f,
            ),
          );
        }
      };

      xhr.onload = () => {
        activeUploadsRef.current--;
        abortControllersRef.current.delete(item.id);
        dispatchedRef.current.delete(item.id);

        if (xhr.status === 201) {
          setQueue((prev) => {
            const next = prev.map((f) =>
              f.id === item.id
                ? { ...f, status: "complete" as const, progress: 100 }
                : f,
            );
            setTimeout(() => processQueueRef.current(next), 0);
            return next;
          });
        } else if (xhr.status === 200) {
          // Duplicate found — parse response and pause this file
          try {
            const data = JSON.parse(xhr.responseText) as {
              duplicateFound: boolean;
              matches: DuplicateMatch[];
              hash: string;
              phash: string;
            };
            if (data.duplicateFound) {
              setQueue((prev) => {
                const next = prev.map((f) =>
                  f.id === item.id
                    ? {
                        ...f,
                        status: "duplicate" as const,
                        duplicateMatches: data.matches,
                        hash: data.hash,
                        phash: data.phash,
                      }
                    : f,
                );
                // Continue processing other files (dialog auto-shows via derived duplicateFile)
                setTimeout(() => processQueueRef.current(next), 0);
                return next;
              });
            }
          } catch {
            setQueue((prev) => {
              const next = prev.map((f) =>
                f.id === item.id
                  ? { ...f, status: "error" as const, error: "Unexpected response" }
                  : f,
              );
              setTimeout(() => processQueueRef.current(next), 0);
              return next;
            });
          }
        } else {
          let errorMsg = "Upload failed";
          try {
            const data = JSON.parse(xhr.responseText) as { error: string };
            errorMsg = data.error || errorMsg;
          } catch {
            // Use default error
          }
          setQueue((prev) => {
            const next = prev.map((f) =>
              f.id === item.id
                ? { ...f, status: "error" as const, error: errorMsg }
                : f,
            );
            setTimeout(() => processQueueRef.current(next), 0);
            return next;
          });
        }
      };

      xhr.onerror = () => {
        activeUploadsRef.current--;
        abortControllersRef.current.delete(item.id);
        dispatchedRef.current.delete(item.id);

        setQueue((prev) => {
          const next = prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error" as const, error: "Network error" }
              : f,
          );
          setTimeout(() => processQueueRef.current(next), 0);
          return next;
        });
      };

      xhr.send(formData);
    },
    [sessionId, personId, setId],
  );

  const processQueue = useCallback(
    (currentQueue: UploadFile[]) => {
      const pending = currentQueue.filter((f) => f.status === "pending");
      const slotsAvailable = MAX_CONCURRENT - activeUploadsRef.current;

      if (slotsAvailable <= 0 || pending.length === 0) {
        const allDone = currentQueue.every(
          (f) =>
            f.status === "complete" ||
            f.status === "error" ||
            f.status === "duplicate",
        );
        if (allDone && currentQueue.length > 0) {
          // Only trigger batch complete if no duplicates are pending review
          const hasPendingDuplicates = currentQueue.some(
            (f) => f.status === "duplicate",
          );
          if (!hasPendingDuplicates) {
            onBatchComplete?.();
            router.refresh();
          }
        }
        return;
      }

      const toStart = pending.slice(0, slotsAvailable);
      for (const item of toStart) {
        sendUpload(item);
      }
    },
    [onBatchComplete, router, sendUpload],
  );

  // Keep ref in sync with latest callback
  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  // Duplicate dialog actions
  const handleDuplicateDecline = useCallback(() => {
    if (!duplicateFile) return;
    const fileId = duplicateFile.id;
    setQueue((prev) => {
      const item = prev.find((f) => f.id === fileId);
      if (item) URL.revokeObjectURL(item.preview);
      const next = prev.filter((f) => f.id !== fileId);
      setTimeout(() => processQueueRef.current(next), 0);
      return next;
    });
  }, [duplicateFile]);

  const handleDuplicateAccept = useCallback(() => {
    if (!duplicateFile) return;
    const item = duplicateFile;
    // Re-submit with duplicateAction=accept (status changes to "uploading", next duplicate auto-shows)
    sendUpload(item, { duplicateAction: "accept" });
  }, [duplicateFile, sendUpload]);

  const handleDuplicateReplace = useCallback(
    (mediaItemId: string) => {
      if (!duplicateFile) return;
      const item = duplicateFile;
      // Re-submit with duplicateAction=replace (status changes to "uploading", next duplicate auto-shows)
      sendUpload(item, {
        duplicateAction: "replace",
        replaceMediaItemId: mediaItemId,
      });
    },
    [duplicateFile, sendUpload],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of files) {
        const err = validateFile(file);
        if (err) {
          errors.push(err);
        } else {
          validFiles.push(file);
        }
      }

      setValidationErrors(errors);
      if (validFiles.length === 0) return;

      const metadata = computeMetadata(
        validFiles,
        personId,
        setId,
        filledHeadshotSlots,
        totalHeadshotSlots,
      );

      const newItems: UploadFile[] = validFiles.map((file, i) => ({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
        status: "pending" as const,
        progress: 0,
        sortOrder: queue.length + i,
        usage: metadata[i].usage,
        slot: metadata[i].slot,
      }));

      setQueue((prev) => {
        const next = [...prev, ...newItems];
        // Start processing
        setTimeout(() => processQueue(next), 0);
        return next;
      });
    },
    [
      personId,
      setId,
      filledHeadshotSlots,
      totalHeadshotSlots,
      queue.length,
      processQueue,
    ],
  );

  // Expose addFiles to parent via ref
  useEffect(() => {
    if (!addFilesRef) return;
    if (typeof addFilesRef === "function") {
      addFilesRef(addFiles);
    } else {
      (addFilesRef as React.MutableRefObject<((files: FileList | File[]) => void) | null>).current = addFiles;
    }
  }, [addFilesRef, addFiles]);

  const retryFile = useCallback(
    (fileId: string) => {
      setQueue((prev) => {
        const next = prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "pending" as const, progress: 0, error: undefined }
            : f,
        );
        setTimeout(() => processQueue(next), 0);
        return next;
      });
    },
    [processQueue],
  );

  const removeFile = useCallback((fileId: string) => {
    const xhr = abortControllersRef.current.get(fileId);
    if (xhr) {
      xhr.abort();
      abortControllersRef.current.delete(fileId);
      activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
    }
    dispatchedRef.current.delete(fileId);
    setQueue((prev) => {
      const item = prev.find((f) => f.id === fileId);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => {
      for (const item of prev) {
        if (item.status === "complete") URL.revokeObjectURL(item.preview);
      }
      return prev.filter((f) => f.status !== "complete");
    });
    setValidationErrors([]);
  }, []);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = "";
  }

  const completedCount = queue.filter((f) => f.status === "complete").length;
  const errorCount = queue.filter((f) => f.status === "error").length;
  const duplicateCount = queue.filter((f) => f.status === "duplicate").length;
  const totalCount = queue.length;

  return (
    <div className="space-y-3">
      {/* Dropzone (hidden when parent provides its own triggers) */}
      {!hideDropzone && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Upload photos"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-all duration-150",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/5",
            isUploading && "pointer-events-none opacity-60",
          )}
        >
          <Camera size={24} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop photos here or click to browse
          </p>
          <p className="text-xs text-muted-foreground/70">
            JPEG, PNG, WebP, or GIF up to 25MB &middot; Multiple files supported
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="space-y-1">
          {validationErrors.map((err, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-sm text-destructive"
            >
              <AlertCircle size={14} className="shrink-0" />
              {err}
            </div>
          ))}
        </div>
      )}

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          {/* Overall progress bar */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedCount}/{totalCount} uploaded
              {errorCount > 0 && ` (${errorCount} failed)`}
              {duplicateCount > 0 && ` (${duplicateCount} duplicate${duplicateCount > 1 ? "s" : ""})`}
            </span>
            {completedCount > 0 && !isUploading && (
              <button
                type="button"
                onClick={clearCompleted}
                className="text-primary hover:text-primary/80 transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Thumbnail grid */}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {queue.map((item) => (
              <div
                key={item.id}
                className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-muted/30"
              >
                <Image
                  src={item.preview}
                  alt={item.file.name}
                  fill
                  className="object-cover"
                  unoptimized
                />

                {/* Status overlay */}
                {item.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                    <Upload
                      size={16}
                      className="animate-pulse text-white"
                    />
                    <span className="mt-1 text-xs font-medium text-white">
                      {item.progress}%
                    </span>
                    {/* Progress ring at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {item.status === "complete" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="rounded-full bg-emerald-500 p-1">
                      <Check size={14} className="text-white" />
                    </div>
                  </div>
                )}

                {item.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60">
                    <AlertCircle size={16} className="text-destructive" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryFile(item.id);
                      }}
                      className="flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white hover:bg-white/30 transition-colors"
                    >
                      <RotateCcw size={10} />
                      Retry
                    </button>
                  </div>
                )}

                {item.status === "duplicate" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-amber-900/60">
                    <AlertCircle size={16} className="text-amber-400" />
                    <span className="text-[10px] font-medium text-amber-200">
                      Duplicate
                    </span>
                  </div>
                )}

                {/* Remove button */}
                {(item.status === "pending" || item.status === "error") && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(item.id);
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white/80 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X size={12} />
                  </button>
                )}

                {/* Usage badge */}
                {item.usage && (
                  <div className="absolute bottom-1 left-1">
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 text-[9px] font-medium leading-none",
                        item.usage === "HEADSHOT"
                          ? "bg-blue-500/80 text-white"
                          : item.usage === "PORTFOLIO"
                            ? "bg-purple-500/80 text-white"
                            : "bg-slate-500/80 text-white",
                      )}
                    >
                      {item.usage === "HEADSHOT"
                        ? `H${item.slot ?? ""}`
                        : item.usage}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate review dialog */}
      {duplicateFile && duplicateFile.duplicateMatches && (
        <DuplicateReviewDialog
          open={!!duplicateFile}
          uploadingFile={{
            name: duplicateFile.file.name,
            preview: duplicateFile.preview,
            size: duplicateFile.file.size,
          }}
          matches={duplicateFile.duplicateMatches}
          onDecline={handleDuplicateDecline}
          onAccept={handleDuplicateAccept}
          onReplace={handleDuplicateReplace}
        />
      )}
    </div>
  );
}
