import Link from "next/link";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { getChannels } from "@/lib/services/channel-service";

type ChannelItem = Awaited<ReturnType<typeof getChannels>>[number];

type ChannelCardProps = {
  channel: ChannelItem;
};

export function ChannelCard({ channel }: ChannelCardProps) {
  const setCount = channel._count.sets;

  return (
    <Link
      href={`/channels/${channel.id}`}
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
            <Radio size={16} className="text-primary" />
          </div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {channel.name}
          </h3>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 text-xs">
          {channel.label && (
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
            {channel.label.name}
          </span>
          )}
          {channel.platform && (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
              {channel.platform}
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/60 px-2.5 py-0.5 font-medium text-muted-foreground">
            {setCount} {setCount === 1 ? "set" : "sets"}
          </span>
        </div>
      </div>
    </Link>
  );
}
