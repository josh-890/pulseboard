import Link from "next/link";
import { cn } from "@/lib/utils";
import { EntityBadge } from "@/components/shared/entity-badge";
import { generateEntityVisual } from "@/lib/entity-visual";
import type { getLabels } from "@/lib/services/label-service";

type LabelItem = Awaited<ReturnType<typeof getLabels>>[number];

type LabelCardProps = {
  label: LabelItem;
};

export function LabelCard({ label }: LabelCardProps) {
  const visual = generateEntityVisual(label.name, "LABEL");
  const visibleNetworks = label.networks.slice(0, 2);

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
            <EntityBadge visual={visual} size="sm" />
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

          {/* Network membership pills */}
          {visibleNetworks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {visibleNetworks.map(({ network }) => (
                <span
                  key={network.id}
                  className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {network.name}
                </span>
              ))}
              {label.networks.length > 2 && (
                <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                  +{label.networks.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
