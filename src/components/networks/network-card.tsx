import Link from "next/link";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";
import type { getNetworks } from "@/lib/services/network-service";

type NetworkItem = Awaited<ReturnType<typeof getNetworks>>[number];

type NetworkCardProps = {
  network: NetworkItem;
};

export function NetworkCard({ network }: NetworkCardProps) {
  const labelCount = network.labelMemberships.length;
  const channelCount = network.labelMemberships.reduce(
    (sum, m) => sum + m.label.channelMaps.length,
    0,
  );

  return (
    <Link
      href={`/networks/${network.id}`}
      className="group block focus-visible:outline-none"
    >
      <div
        className={cn(
          "rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        {/* Icon + name */}
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Network size={16} className="text-primary" />
          </div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {network.name}
          </h3>
        </div>

        {/* Description */}
        {network.description && (
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
            {network.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
            {labelCount} {labelCount === 1 ? "label" : "labels"}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
            {channelCount} {channelCount === 1 ? "channel" : "channels"}
          </span>
        </div>
      </div>
    </Link>
  );
}
