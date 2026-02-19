import { cn } from "@/lib/utils";
import type { BodyMarkWithEvents, BodyMarkType, BodyMarkStatus } from "@/lib/types";

type BodyMarkCardProps = {
  mark: BodyMarkWithEvents;
};

const TYPE_STYLES: Record<BodyMarkType, string> = {
  tattoo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  scar: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  mark: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  burn: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  deformity: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  other: "bg-muted/50 text-muted-foreground border-white/15",
};

const STATUS_STYLES: Record<BodyMarkStatus, string> = {
  present: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  modified: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  removed: "bg-slate-500/15 text-slate-500 border-slate-500/30 line-through",
};

export function BodyMarkCard({ mark }: BodyMarkCardProps) {
  const locationParts = [mark.bodyRegion, mark.side, mark.position].filter(Boolean);

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
            TYPE_STYLES[mark.type],
          )}
        >
          {mark.type}
        </span>
        <span className="text-sm font-medium text-foreground/80">
          {locationParts.join(" · ")}
        </span>
        {mark.status !== "present" && (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
              STATUS_STYLES[mark.status],
            )}
          >
            {mark.status}
          </span>
        )}
      </div>

      {mark.motif && (
        <p className="text-sm font-medium text-foreground">{mark.motif}</p>
      )}
      {mark.description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{mark.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {mark.size && (
          <span className="text-xs text-muted-foreground/70">{mark.size}</span>
        )}
        {mark.colors.length > 0 && (
          <span className="text-xs text-muted-foreground/70">
            {mark.colors.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
