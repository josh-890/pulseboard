"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PendingFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type ExistingPhoto = {
  id: string;
  url: string;
  width: number;
  height: number;
};

type InlineUploadZoneProps = {
  pendingFiles: PendingFile[];
  onPendingFilesChange: (files: PendingFile[]) => void;
  existingPhotos?: ExistingPhoto[];
  className?: string;
};

let nextId = 0;

export function createPendingFile(file: File): PendingFile {
  return {
    id: `pending-${++nextId}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function cleanupPendingFiles(files: PendingFile[]) {
  for (const f of files) {
    URL.revokeObjectURL(f.previewUrl);
  }
}

export function InlineUploadZone({
  pendingFiles,
  onPendingFilesChange,
  existingPhotos,
  className,
}: InlineUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const newFiles = Array.from(fileList)
        .filter((f) => f.type.startsWith("image/"))
        .map(createPendingFile);
      if (newFiles.length > 0) {
        onPendingFilesChange([...pendingFiles, ...newFiles]);
      }
    },
    [pendingFiles, onPendingFilesChange],
  );

  const removePending = useCallback(
    (id: string) => {
      const file = pendingFiles.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.previewUrl);
      onPendingFilesChange(pendingFiles.filter((f) => f.id !== id));
    },
    [pendingFiles, onPendingFilesChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const hasContent = (existingPhotos && existingPhotos.length > 0) || pendingFiles.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <label className="mb-1.5 block text-sm font-medium">Photos</label>

      {/* Thumbnails */}
      {hasContent && (
        <div className="flex flex-wrap gap-2">
          {existingPhotos?.map((photo) => (
            <div
              key={photo.id}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/15"
            >
              <Image
                src={photo.url}
                alt=""
                width={photo.width}
                height={photo.height}
                unoptimized
                className="h-full w-full object-cover"
              />
            </div>
          ))}
          {pendingFiles.map((pf) => (
            <div
              key={pf.id}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-primary/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pf.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePending(pf.id)}
                className="absolute -right-1 -top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-xs text-muted-foreground transition-colors",
          isDragOver
            ? "border-primary/50 bg-primary/5 text-primary"
            : "border-white/20 hover:border-white/40 hover:text-foreground",
        )}
      >
        <Upload size={14} />
        {pendingFiles.length > 0
          ? `${pendingFiles.length} photo${pendingFiles.length === 1 ? "" : "s"} ready • Add more`
          : "Drop photos or click to add"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/**
 * Upload pending files and link them to a detail category + entity.
 * Returns the created media item IDs.
 */
export async function uploadAndLinkFiles(
  pendingFiles: PendingFile[],
  sessionId: string,
  personId: string,
  categoryId: string,
  entityField?: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
  entityId?: string,
): Promise<string[]> {
  const { linkMediaToDetailCategoryAction } = await import("@/lib/actions/media-actions");

  const ids: string[] = [];
  for (const pf of pendingFiles) {
    const formData = new FormData();
    formData.append("file", pf.file);
    formData.append("sessionId", sessionId);
    formData.append("personId", personId);
    const res = await fetch("/api/media/upload", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      const data = (await res.json()) as { id: string };
      ids.push(data.id);
    }
  }

  if (ids.length > 0) {
    await linkMediaToDetailCategoryAction(
      personId,
      ids,
      categoryId,
      entityField,
      entityId,
    );
  }

  return ids;
}
