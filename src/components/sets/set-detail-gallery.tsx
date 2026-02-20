"use client";

import { useRouter } from "next/navigation";
import { JustifiedGallery } from "@/components/photos/justified-gallery";
import { ImageUpload } from "@/components/photos/image-upload";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type SetDetailGalleryProps = {
  photos: PhotoWithUrls[];
  entityId: string;
  profileLabels: ProfileImageLabel[];
};

export function SetDetailGallery({
  photos,
  entityId,
  profileLabels,
}: SetDetailGalleryProps) {
  const router = useRouter();

  return (
    <>
      {photos.length > 0 && (
        <JustifiedGallery
          photos={photos}
          entityType="set"
          entityId={entityId}
          profileLabels={profileLabels}
        />
      )}
      <ImageUpload
        entityType="set"
        entityId={entityId}
        onUploadComplete={() => router.refresh()}
        currentCount={photos.length}
      />
    </>
  );
}
