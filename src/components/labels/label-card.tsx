import Link from "next/link";
import { cn } from "@/lib/utils";
import { EntityMark } from "@/components/shared/entity-mark";
import { brandOf } from "@/lib/services/brand-of";
import { generateEntityVisual } from "@/lib/entity-visual";
import type { getLabels } from "@/lib/services/label-service";

type LabelItem = Awaited<ReturnType<typeof getLabels>>[number];

type LabelCardProps = {
  label: LabelItem;
};

export function LabelCard({ label }: LabelCardProps) {
  const visual = generateEntityVisual(label.name, "LABEL");

  return (
    <Link href={`/labels/${label.id}`} className="group block focus-visible:outline-none">
      <div
        className={cn(
          // Structure: left accent border 3px, all other borders 1px
          "relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
          "border-l-[3px]",
          visual.accentBorder,
          "transition-all duration-150",
          "hover:shadow-md hover:-translate-y-px",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        {/* Very subtle colour tint — barely visible, adds depth */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br",
            visual.cardGradient,
          )}
        />

        <div className="relative space-y-2.5 p-4">
          {/* Badge + title */}
          <div className="flex items-start gap-3">
            <EntityMark brand={brandOf(label)} variant="tile" size="sm" />
            <h3 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug">
              {label.name}
            </h3>
          </div>

          {/* Count chips */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {label.channelMaps.length}{" "}
              {label.channelMaps.length === 1 ? "channel" : "channels"}
            </span>
            <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {label.projects.length}{" "}
              {label.projects.length === 1 ? "project" : "projects"}
            </span>
          </div>

        </div>
      </div>
    </Link>
  );
}
