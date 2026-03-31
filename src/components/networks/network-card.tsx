import Link from "next/link";
import { cn } from "@/lib/utils";
import { EntityBadge } from "@/components/shared/entity-badge";
import { generateEntityVisual } from "@/lib/entity-visual";
import type { getNetworks } from "@/lib/services/network-service";

type NetworkItem = Awaited<ReturnType<typeof getNetworks>>[number];

type NetworkCardProps = {
  network: NetworkItem;
};

export function NetworkCard({ network }: NetworkCardProps) {
  const visual = generateEntityVisual(network.name, "NETWORK");
  const labelCount = network.labelMemberships.length;
  const channelCount = network.labelMemberships.reduce(
    (sum, m) => sum + m.label.channelMaps.length,
    0,
  );

  return (
    <Link href={`/networks/${network.id}`} className="group block focus-visible:outline-none">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
          "border-l-[3px]",
          visual.accentBorder,
          "transition-all duration-150",
          "hover:shadow-md hover:-translate-y-px",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br",
            visual.cardGradient,
          )}
        />

        <div className="relative space-y-2.5 p-4">
          {/* Badge + title + optional description */}
          <div className="flex items-start gap-3">
            <EntityBadge visual={visual} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                {network.name}
              </h3>
              {network.description && (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  {network.description}
                </p>
              )}
            </div>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {labelCount} {labelCount === 1 ? "label" : "labels"}
            </span>
            <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {channelCount} {channelCount === 1 ? "channel" : "channels"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
