import Link from "next/link";
import Image from "next/image";
import { Library, ImageIcon, User, Globe } from "lucide-react";
import { getAllCollections } from "@/lib/services/collection-service";
import { AddCollectionDialog } from "@/components/collections/add-collection-dialog";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await getAllCollections();

  const globalCount = collections.filter((c) => !c.personId).length;
  const personCount = collections.filter((c) => c.personId).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-collection/15">
            <Library size={20} className="text-entity-collection" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Collections</h1>
            <p className="text-sm text-muted-foreground">
              {collections.length} collection{collections.length !== 1 ? "s" : ""}
              {globalCount > 0 && ` · ${globalCount} global`}
              {personCount > 0 && ` · ${personCount} per-person`}
            </p>
          </div>
        </div>
        <AddCollectionDialog />
      </div>

      {/* Collection grid */}
      {collections.length === 0 ? (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
          <Library size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No collections yet. Create one to curate media across sessions and people.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.id}`}
              className="group rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm transition-all hover:border-white/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Thumbnail */}
              <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-muted">
                {collection.thumbnailUrl ? (
                  <Image
                    src={collection.thumbnailUrl}
                    alt={collection.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon size={32} className="text-muted-foreground/40" />
                  </div>
                )}

                {/* Type badge */}
                <div className="absolute left-2 top-2">
                  {collection.personId ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-600 backdrop-blur-sm dark:text-sky-400">
                      <User size={10} />
                      Person
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 backdrop-blur-sm dark:text-emerald-400">
                      <Globe size={10} />
                      Global
                    </span>
                  )}
                </div>

                {/* Item count */}
                <div className="absolute bottom-2 right-2">
                  <span className="inline-flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    <ImageIcon size={10} />
                    {collection.itemCount}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold leading-tight group-hover:text-primary transition-colors">
                  {collection.name}
                </h3>
                {collection.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                )}
                {collection.personName && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {collection.personName}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
