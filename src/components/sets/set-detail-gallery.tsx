"use client";

import { JustifiedGallery } from "@/components/photos/justified-gallery";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type SetDetailGalleryProps = {
  photos: PhotoWithUrls[];
  entityId: string;
  profileLabels: ProfileImageLabel[];
  primarySessionId?: string;
};

export function SetDetailGallery({
  photos,
  entityId,
  profileLabels,
  primarySessionId,
}: SetDetailGalleryProps) {
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
      {primarySessionId && (
        <BatchUploadZone
          sessionId={primarySessionId}
          setId={entityId}
        />
      )}
    </>
  );
}
