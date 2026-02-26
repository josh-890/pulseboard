import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink, ImageIcon, Radio } from "lucide-react";
import { getChannelById } from "@/lib/services/channel-service";
import { getLabels } from "@/lib/services/label-service";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { EditChannelSheet } from "@/components/channels/edit-channel-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteChannel } from "@/lib/actions/channel-actions";

export const dynamic = "force-dynamic";

type ChannelDetailPageProps = {
  params: Promise<{ id: string }>;
};

// ── Sub-components ──────────────────────────────────────────────────────────

type SectionCardProps = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

function SectionCard({ title, icon, children, className }: SectionCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm italic text-muted-foreground/70">{message}</p>;
}

// ── Main page ───────────────────────────────────────────────────────────────

export default async function ChannelDetailPage({
  params,
}: ChannelDetailPageProps) {
  const { id } = await params;

  const [channel, labels] = await Promise.all([
    getChannelById(id),
    getLabels(),
  ]);

  if (!channel) notFound();

  const labelOptions = labels.map(({ id, name }) => ({ id, name }));
  const setCount = channel.sets.length;

  return (
    <div className="space-y-6">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/channels"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">&larr;</span>
          Back to Channels
        </Link>
        <div className="flex items-center gap-2">
          <EditChannelSheet
            channel={{
              id: channel.id,
              name: channel.name,
              labelId: channel.labelMaps[0]?.label.id ?? null,
              platform: channel.platform,
              url: channel.url,
            }}
            labels={labelOptions}
          />
          <DeleteButton
            title="Delete channel?"
            description="This will detach all sets from this channel and permanently remove it. This action cannot be undone."
            onDelete={deleteChannel.bind(null, id)}
            redirectTo="/channels"
          />
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Radio size={22} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight">{channel.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {channel.labelMaps[0]?.label && (
              <Link
                href={`/labels/${channel.labelMaps[0].label.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary"
              >
                <Building2 size={12} />
                {channel.labelMaps[0].label.name}
              </Link>
              )}
              {channel.platform && (
                <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {channel.platform}
                </span>
              )}
            </div>
            {channel.url && (
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ExternalLink size={13} />
                {channel.url}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-white/20 bg-card/70 p-4 text-center shadow-md backdrop-blur-sm">
          <p className="text-2xl font-bold">{setCount}</p>
          <p className="text-xs text-muted-foreground">
            {setCount === 1 ? "Set" : "Sets"}
          </p>
        </div>
      </div>

      {/* Sets */}
      <SectionCard
        title={`Sets (${setCount})`}
        icon={<ImageIcon size={18} />}
      >
        {channel.sets.length === 0 ? (
          <EmptyState message="No sets in this channel." />
        ) : (
          <div className="space-y-2">
            {channel.sets.map((set) => (
              <Link
                key={set.id}
                href={`/sets/${set.id}`}
                className="group flex items-center justify-between rounded-xl border border-white/15 bg-card/40 px-4 py-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <ImageIcon size={14} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium group-hover:text-primary transition-colors">
                      {set.title ?? "Untitled Set"}
                    </span>
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 font-medium">
                    {set.type}
                  </span>
                  {set.releaseDate && (
                    <span>{formatRelativeTime(set.releaseDate)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
