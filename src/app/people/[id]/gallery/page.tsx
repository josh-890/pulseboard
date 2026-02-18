import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JustifiedGallery } from "@/components/photos/justified-gallery";
import { GalleryFilterBar } from "@/components/photos/gallery-filter-bar";
import { ImageUploadZone } from "@/components/photos/image-upload-zone";
import { getPersonById } from "@/lib/services/person-service";
import {
  getPhotosForEntity,
  getPhotosByTags,
} from "@/lib/services/photo-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";

type PersonGalleryPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tag?: string }>;
};

export default async function PersonGalleryPage({
  params,
  searchParams,
}: PersonGalleryPageProps) {
  const { id } = await params;
  const { tag } = await searchParams;

  const person = await getPersonById(id);
  if (!person) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/people">
            <ArrowLeft size={16} className="mr-2" />
            Back to People
          </Link>
        </Button>
        <p className="text-center text-muted-foreground">Person not found</p>
      </div>
    );
  }

  const [photos, profileLabels] = await Promise.all([
    tag
      ? getPhotosByTags("person", id, [tag])
      : getPhotosForEntity("person", id),
    getProfileImageLabels(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href={`/people/${id}`}>
            <ArrowLeft size={16} className="mr-2" />
            Back to {person.firstName} {person.lastName}
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            {person.firstName}&apos;s Gallery
          </h1>
          <span className="text-sm text-muted-foreground">
            {photos.length} {photos.length === 1 ? "photo" : "photos"}
          </span>
        </div>

        <div className="mb-6">
          <GalleryFilterBar basePath={`/people/${id}/gallery`} />
        </div>

        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="mb-1 text-muted-foreground">No photos found</p>
            {tag && (
              <p className="text-sm text-muted-foreground/70">
                Try removing the tag filter
              </p>
            )}
          </div>
        ) : (
          <JustifiedGallery
            photos={photos}
            entityType="person"
            entityId={id}
            profileLabels={profileLabels}
          />
        )}
      </div>

      <ImageUploadZone entityType="person" entityId={id} />
    </div>
  );
}
