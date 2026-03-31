import Link from "next/link";
import { cn } from "@/lib/utils";
import { EntityBadge } from "@/components/shared/entity-badge";
import { generateEntityVisual } from "@/lib/entity-visual";
import type { getChannels } from "@/lib/services/channel-service";

type ChannelItem = Awaited<ReturnType<typeof getChannels>>[number];

type ChannelCardProps = {
  channel: ChannelItem;
};

export function ChannelCard({ channel }: ChannelCardProps) {
  const visual = generateEntityVisual(channel.name, "CHANNEL");
  const setCount = channel._count.sets;

  return (
    <Link href={`/channels/${channel.id}`} className="group block focus-visible:outline-none">
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
          {/* Badge + title */}
          <div className="flex items-start gap-3">
            <EntityBadge visual={visual} size="sm" />
            <h3 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug">
              {channel.name}
            </h3>
          </div>

          {/* Chips */}
          <div className="flex flex-wrap gap-1.5">
            {channel.labelMaps[0]?.label && (
              <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {channel.labelMaps[0].label.name}
              </span>
            )}
            {channel.platform && (
              <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {channel.platform}
              </span>
            )}
            <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {setCount} {setCount === 1 ? "set" : "sets"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
