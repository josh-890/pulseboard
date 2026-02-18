import { ImageIcon } from "lucide-react";
import { SetCard } from "./set-card";
import type { getSets } from "@/lib/services/set-service";

type SetGridProps = {
  sets: Awaited<ReturnType<typeof getSets>>;
};

export function SetGrid({ sets }: SetGridProps) {
  if (sets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No sets found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sets.map((set) => (
        <SetCard key={set.id} set={set} />
      ))}
    </div>
  );
}
