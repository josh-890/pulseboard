import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  getSavedFilter,
  getSmartCollectionGallery,
  SMART_COLLECTION_SHOWN,
  smartQueryText,
} from "@/lib/services/saved-filter-service";
import { getTagFacets } from "@/lib/services/tag-filter-service";
import { GalleryTagFilter } from "@/components/tags";
import { FavoritesGallery } from "@/components/gallery/favorites-gallery";
import { SmartCollectionActions } from "@/components/collections/smart-collection-actions";

export const dynamic = "force-dynamic";

type SmartCollectionPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tags?: string }>;
};

// A Smart Collection (ADR-0033, S6): a saved image tag query, evaluated live
// against the whole library. Editing the query previews it through `?tags=`;
// Save writes it back, Revert drops the preview.
export default async function SmartCollectionPage({ params, searchParams }: SmartCollectionPageProps) {
  return withTenantFromHeaders(async () => {
    const [{ id }, sp] = await Promise.all([params, searchParams]);
    const row = await getSavedFilter(id);
    if (!row || row.scope !== "media") notFound();

    const stored = smartQueryText(row);
    const preview = sp.tags !== undefined ? sp.tags : stored;
    const dirty = sp.tags !== undefined && sp.tags.trim() !== stored.trim();
    const [{ items, total, problems }, facets] = await Promise.all([
      getSmartCollectionGallery(preview),
      getTagFacets("MEDIA_ITEM"),
    ]);

    return (
      <div className="space-y-6">
        <Link
          href="/collections"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Collections
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Zap size={20} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{row.name}</h1>
              <p className="text-sm text-muted-foreground">
                Smart collection · {total} image{total !== 1 ? "s" : ""}
                {total > items.length ? ` · showing the newest ${SMART_COLLECTION_SHOWN}` : ""}
              </p>
            </div>
          </div>
          <SmartCollectionActions id={row.id} name={row.name} dirty={dirty} preview={preview} total={total} />
        </div>

        <GalleryTagFilter
          facets={facets}
          problems={problems}
          shown={total}
          total={total}
          allowSmartSave={false}
          value={stored}
        />

        {!preview.trim() ? (
          <div className="rounded-2xl border border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
            The query is empty — add tags or conditions above.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
            No image matches this query yet. It fills by itself as images get tagged.
          </div>
        ) : (
          <FavoritesGallery items={items} />
        )}
      </div>
    );
  });
}
