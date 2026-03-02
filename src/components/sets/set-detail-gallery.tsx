"use client";

import { useCallback, useState } from "react";
import { JustifiedGallery } from "@/components/photos/justified-gallery";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { setSetCover } from "@/lib/actions/set-actions";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type SetDetailGalleryProps = {
  photos: PhotoWithUrls[];
  entityId: string;
  profileLabels: ProfileImageLabel[];
  primarySessionId?: string;
  coverMediaItemId?: string | null;
};

export function SetDetailGallery({
  photos,
  entityId,
  profileLabels,
  primarySessionId,
  coverMediaItemId: initialCoverId,
}: SetDetailGalleryProps) {
  const [coverId, setCoverId] = useState(initialCoverId ?? null);

  const handleSetCover = useCallback(
    (mediaItemId: string | null) => {
      setCoverId(mediaItemId);
      setSetCover(entityId, mediaItemId);
    },
    [entityId],
  );

  return (
    <>
      {photos.length > 0 && (
        <JustifiedGallery
          photos={photos}
          entityType="set"
          entityId={entityId}
          profileLabels={profileLabels}
          coverMediaItemId={coverId}
          onSetCover={handleSetCover}
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
