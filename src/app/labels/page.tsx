import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { getLabelTiles } from "@/lib/services/maker-list-service";
import { MakerTile } from "@/components/shared/maker-tile";
import { MakerRows } from "@/components/shared/maker-rows";
import { MakerListToolbar, parseMinRating, parseSort, type MakerListParams } from "@/components/shared/maker-list-toolbar";
import { LabelSearch } from "@/components/labels/label-search";
import { AddLabelSheet } from "@/components/labels/add-label-sheet";

export const dynamic = "force-dynamic";

type LabelsPageProps = {
  searchParams: Promise<MakerListParams>;
};

export default async function LabelsPage({ searchParams }: LabelsPageProps) {
  return withTenantFromHeaders(async () => {
    const params = await searchParams;
    const labels = await getLabelTiles({
      q: params.q?.trim() || undefined,
      minRating: parseMinRating(params.rating),
      sort: parseSort(params.sort),
    });

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-label/15">
              <Building2 size={20} className="text-entity-label" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Labels</h1>
              <p className="text-sm text-muted-foreground">
                {labels.length} {labels.length === 1 ? "label" : "labels"}
              </p>
            </div>
          </div>
          <AddLabelSheet />
        </div>

        {/* Search + sort and filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:max-w-xs">
            <Suspense>
              <LabelSearch />
            </Suspense>
          </div>
          <MakerListToolbar basePath="/labels" params={params} />
        </div>

        {labels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 size={48} className="mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No labels found.</p>
          </div>
        ) : params.view === "list" ? (
          <MakerRows tiles={labels} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {labels.map((l) => (
              <li key={l.id}>
                <MakerTile tile={l} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  });
}
