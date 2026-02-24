import { Suspense } from "react";
import { Radio } from "lucide-react";
import { getChannels } from "@/lib/services/channel-service";
import { getLabels } from "@/lib/services/label-service";
import { ChannelList } from "@/components/channels/channel-list";
import { ChannelSearch } from "@/components/channels/channel-search";
import { LabelFilter } from "@/components/channels/label-filter";
import { AddChannelSheet } from "@/components/channels/add-channel-sheet";

export const dynamic = "force-dynamic";

type ChannelsPageProps = {
  searchParams: Promise<{ q?: string; labelId?: string }>;
};

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  const { q, labelId } = await searchParams;

  const [channels, labels] = await Promise.all([
    getChannels({
      q: q?.trim() || undefined,
      labelId: labelId || undefined,
    }),
    getLabels(),
  ]);

  const labelOptions = labels.map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Radio size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Channels</h1>
            <p className="text-sm text-muted-foreground">
              {channels.length} {channels.length === 1 ? "channel" : "channels"}
            </p>
          </div>
        </div>
        <AddChannelSheet labels={labelOptions} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <ChannelSearch />
          </Suspense>
        </div>
        <Suspense>
          <LabelFilter labels={labelOptions} />
        </Suspense>
      </div>

      {/* List */}
      <ChannelList channels={channels} />
    </div>
  );
}
