import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import Link from "next/link";
import { Radio, ShieldCheck } from "lucide-react";
import type { ChannelTier } from "@/generated/prisma/client";
import { getChannelTiles } from "@/lib/services/maker-list-service";
import { CHANNEL_TIER_VALUES } from "@/lib/constants/channel-tier";
import { MakerTile } from "@/components/shared/maker-tile";
import { MakerRows } from "@/components/shared/maker-rows";
import { MakerListToolbar, parseMinRating, parseSort, type MakerListParams } from "@/components/shared/maker-list-toolbar";
import { countChannelCheckItems } from "@/lib/services/channel-check-service";
import { getLabels } from "@/lib/services/label-service";
import { ChannelSearch } from "@/components/channels/channel-search";
import { LabelFilter } from "@/components/channels/label-filter";
import { AddChannelSheet } from "@/components/channels/add-channel-sheet";

export const dynamic = "force-dynamic";

type ChannelsPageProps = {
  searchParams: Promise<MakerListParams>;
};

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  return withTenantFromHeaders(async () => {
    const params = await searchParams;
    const tier = CHANNEL_TIER_VALUES.find((t) => t === params.tier) as ChannelTier | undefined;

    const [channels, labels, checkItems] = await Promise.all([
      getChannelTiles({
        q: params.q?.trim() || undefined,
        labelId: params.labelId || undefined,
        tier,
        minRating: parseMinRating(params.rating),
        sort: parseSort(params.sort),
      }),
      getLabels(),
      countChannelCheckItems(),
    ]);

    const labelOptions = labels.map(({ id, name }) => ({ id, name }));

    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-channel/15">
              <Radio size={20} className="text-entity-channel" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Channels</h1>
              <p className="text-sm text-muted-foreground">
                {channels.length} {channels.length === 1 ? "channel" : "channels"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/channels/check"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-card/40 px-3 text-sm font-medium transition-colors hover:border-white/30 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShieldCheck size={16} aria-hidden />
              Channel check
              {checkItems > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 text-xs tabular-nums text-amber-600 dark:text-amber-400">
                  {checkItems}
                </span>
              )}
            </Link>
            <AddChannelSheet labels={labelOptions} />
          </div>
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
          <MakerListToolbar basePath="/channels" params={params} withTier />
        </div>

        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Radio size={48} className="mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No channels found.</p>
          </div>
        ) : params.view === "list" ? (
          <MakerRows tiles={channels} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {channels.map((c) => (
              <li key={c.id}>
                <MakerTile tile={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  });
}
