import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { getLabels } from "@/lib/services/label-service";
import { LabelList } from "@/components/labels/label-list";
import { LabelSearch } from "@/components/labels/label-search";
import { AddLabelSheet } from "@/components/labels/add-label-sheet";

export const dynamic = "force-dynamic";

type LabelsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function LabelsPage({ searchParams }: LabelsPageProps) {
  const { q } = await searchParams;

  const labels = await getLabels(q?.trim() || undefined);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Building2 size={20} className="text-primary" />
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

      {/* Search */}
      <div className="w-full sm:max-w-xs">
        <Suspense>
          <LabelSearch />
        </Suspense>
      </div>

      {/* List */}
      <LabelList labels={labels} />
    </div>
  );
}
