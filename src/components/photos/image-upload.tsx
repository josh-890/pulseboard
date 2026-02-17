"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Upload, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhotoWithUrls } from "@/lib/types";

type ImageUploadProps = {
  entityType: "person" | "project";
  entityId: string;
  onUploadComplete: (photo: PhotoWithUrls) => void;
  currentCount: number;
  tags?: string[];
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 25 * 1024 * 1024;

export function ImageUpload({
  entityType,
  entityId,
  onUploadComplete,
  currentCount,
  tags,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_SIZE) return "File size must be 25MB or less";
    if (!ALLOWED_TYPES.includes(file.type))
      return "File must be JPEG, PNG, WebP, or GIF";
    return null;
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setIsUploading(true);
      setProgress(0);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", entityType);
        formData.append("entityId", entityId);
        if (tags && tags.length > 0) {
          formData.append("tags", tags.join(","));
        }

        const photo = await new Promise<PhotoWithUrls>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/photos/upload");

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status === 201) {
              const data = JSON.parse(xhr.responseText) as { photo: PhotoWithUrls };
              resolve(data.photo);
            } else {
              const data = JSON.parse(xhr.responseText) as { error: string };
              reject(new Error(data.error || "Upload failed"));
            }
          };

          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.send(formData);
        });

        onUploadComplete(photo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [entityType, entityId, onUploadComplete, validateFile, tags],
  );

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
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
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
        aria-label="Upload photo"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-all duration-150",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/5",
          isUploading && "pointer-events-none opacity-60",
        )}
      >
        {isUploading ? (
          <>
            <Upload size={24} className="animate-pulse text-primary" />
            <p className="text-sm text-muted-foreground">
              Uploading... {progress}%
            </p>
            <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <Camera size={24} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {currentCount === 0
                ? "Drop a photo here or click to upload"
                : "Add another photo"}
            </p>
            <p className="text-xs text-muted-foreground/70">
              JPEG, PNG, WebP, or GIF up to 25MB
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
