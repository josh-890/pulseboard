"use client";

import { useCallback, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, Heart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setFavorite, removePhoto } from "@/lib/actions/photo-actions";
import { ImageUpload } from "./image-upload";
import { ImageCarousel } from "./image-carousel";
import { ThumbnailStrip } from "./thumbnail-strip";
import { Lightbox } from "./lightbox";
import type { PhotoWithUrls } from "@/lib/types";

type ImageGalleryProps = {
  photos: PhotoWithUrls[];
  entityType: "person" | "set";
  entityId: string;
};

export function ImageGallery({
  photos: initialPhotos,
  entityType,
  entityId,
}: ImageGalleryProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUploadComplete = useCallback(
    (newPhoto: PhotoWithUrls) => {
      setPhotos((prev) => [...prev, newPhoto]);
      if (photos.length === 0) {
        startTransition(async () => {
          await setFavorite({
            photoId: newPhoto.id,
            entityType,
            entityId,
          });
        });
      }
      router.refresh();
    },
    [photos.length, entityType, entityId, router],
  );

  const handleFavoriteToggle = useCallback(
    (photoId: string) => {
      setPhotos((prev) =>
        prev.map((p) => ({
          ...p,
          isFavorite: p.id === photoId,
        })),
      );

      startTransition(async () => {
        await setFavorite({ photoId, entityType, entityId });
        router.refresh();
      });
    },
    [entityType, entityId, router],
  );

  const handleDelete = useCallback(
    (photoId: string) => {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setActiveIndex((prev) => Math.min(prev, Math.max(0, photos.length - 2)));

      startTransition(async () => {
        await removePhoto(photoId, entityId);
        router.refresh();
      });
    },
    [entityId, photos.length, router],
  );

  const currentItem = photos[activeIndex];

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <h2 className="mb-4 text-xl font-semibold">Photos</h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Camera size={48} className="mb-3 text-muted-foreground/40" />
          <p className="mb-1 text-muted-foreground">No photos yet</p>
          <p className="mb-4 text-sm text-muted-foreground/70">
            Upload a photo to get started
          </p>
        </div>
        <ImageUpload
          entityType={entityType}
          entityId={entityId}
          onUploadComplete={handleUploadComplete}
          currentCount={0}
        />
      </div>
    );
  }

  if (photos.length === 1 && currentItem) {
    const displayUrl =
      currentItem.urls.gallery_1024 ?? currentItem.urls.gallery_512 ?? currentItem.urls.original;

    return (
      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Photos</h2>
          <button
            type="button"
            onClick={() => handleDelete(currentItem.id)}
            aria-label="Delete photo"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="group relative">
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              className="relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-2xl"
              aria-label="View photo fullscreen"
            >
              <Image
                src={displayUrl}
                alt={currentItem.caption ?? "Photo"}
                fill
                className="object-cover"
                unoptimized
              />
            </button>
            <button
              type="button"
              onClick={() => handleFavoriteToggle(currentItem.id)}
              aria-label={
                currentItem.isFavorite
                  ? "Remove from favorites"
                  : "Set as favorite"
              }
              className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white transition-all duration-150 hover:bg-black/60"
            >
              <Heart
                size={18}
                className={cn(
                  "transition-all duration-150",
                  currentItem.isFavorite && "fill-red-500 text-red-500",
                )}
              />
            </button>
          </div>
          <ImageUpload
            entityType={entityType}
            entityId={entityId}
            onUploadComplete={handleUploadComplete}
            currentCount={photos.length}
          />
        </div>

        {lightboxIndex !== null && (
          <Lightbox
            photos={photos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onFavoriteToggle={handleFavoriteToggle}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10",
        isPending && "opacity-80",
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Photos</h2>
        {currentItem && (
          <button
            type="button"
            onClick={() => handleDelete(currentItem.id)}
            aria-label="Delete current photo"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <ImageCarousel
          photos={photos}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
          onImageClick={setLightboxIndex}
          onFavoriteToggle={handleFavoriteToggle}
        />

        <ThumbnailStrip
          photos={photos}
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />

        <ImageUpload
          entityType={entityType}
          entityId={entityId}
          onUploadComplete={handleUploadComplete}
          currentCount={photos.length}
        />
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}
    </div>
  );
}
