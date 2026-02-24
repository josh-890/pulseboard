import { Radio } from "lucide-react";
import { ChannelCard } from "./channel-card";
import type { getChannels } from "@/lib/services/channel-service";

type ChannelListProps = {
  channels: Awaited<ReturnType<typeof getChannels>>;
};

export function ChannelList({ channels }: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Radio size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No channels found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {channels.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} />
      ))}
    </div>
  );
}
