"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "./image-upload";
import type { PhotoWithUrls } from "@/lib/types";

type ImageUploadZoneProps = {
  entityType: "person" | "project";
  entityId: string;
};

export function ImageUploadZone({ entityType, entityId }: ImageUploadZoneProps) {
  const router = useRouter();

  const handleUploadComplete = useCallback(
    (_photo: PhotoWithUrls) => {
      router.refresh();
    },
    [router],
  );

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
      <h2 className="mb-4 text-xl font-semibold">Upload Photos</h2>
      <ImageUpload
        entityType={entityType}
        entityId={entityId}
        onUploadComplete={handleUploadComplete}
        currentCount={1}
      />
    </div>
  );
}
