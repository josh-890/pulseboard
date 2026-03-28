import { notFound } from "next/navigation";
import Link from "next/link";
import { Library, Globe, User, ImageIcon } from "lucide-react";
import {
  getCollectionWithItems,
  getCollectionGalleryItems,
} from "@/lib/services/collection-service";
import { CollectionDetailGallery } from "@/components/collections/collection-detail-gallery";
import { CollectionActions } from "@/components/collections/collection-actions";

export const dynamic = "force-dynamic";

type CollectionDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CollectionDetailPage({ params }: CollectionDetailPageProps) {
  const { id } = await params;

  const collection = await getCollectionWithItems(id);
  if (!collection) notFound();

  const galleryItems = await getCollectionGalleryItems(id);

  const personName = collection.person?.aliases[0]?.name ?? null;

  return (
    <div className="space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/collections"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">&larr;</span>
          Back to Collections
        </Link>
        <CollectionActions
          collectionId={id}
          name={collection.name}
          description={collection.description}
        />
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-entity-collection/15">
            <Library size={20} className="text-entity-collection" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight">{collection.name}</h1>
            {collection.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {collection.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {collection.personId ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                  <User size={10} />
                  {personName ?? "Person"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Globe size={10} />
                  Global
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon size={12} />
                {galleryItems.length} item{galleryItems.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <CollectionDetailGallery
        collectionId={id}
        items={galleryItems}
      />
    </div>
  );
}
