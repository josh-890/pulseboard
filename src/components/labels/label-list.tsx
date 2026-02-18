import { Building2 } from "lucide-react";
import { LabelCard } from "./label-card";
import type { getLabels } from "@/lib/services/label-service";

type LabelListProps = {
  labels: Awaited<ReturnType<typeof getLabels>>;
};

export function LabelList({ labels }: LabelListProps) {
  if (labels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Building2 size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No labels found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Try adjusting your search.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {labels.map((label) => (
        <LabelCard key={label.id} label={label} />
      ))}
    </div>
  );
}
