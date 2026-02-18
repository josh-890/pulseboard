"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "./image-upload";

type ImageUploadZoneProps = {
  entityType: "person" | "set";
  entityId: string;
};

export function ImageUploadZone({ entityType, entityId }: ImageUploadZoneProps) {
  const router = useRouter();

  const handleUploadComplete = useCallback(() => {
    router.refresh();
  }, [router]);

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
