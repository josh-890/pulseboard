import { withTenantFromHeaders } from "@/lib/tenant-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink, ImageIcon, FileInput, HardDrive, Layers, Video, ArrowRight } from "lucide-react";
import {
  getChannelById,
  getChannelPipeline,
  type ChannelPipelineStatus,
} from "@/lib/services/channel-service";
import type { StagingSetStatus } from "@/generated/prisma/client";
import { StatusPill, STATUS_STRIPE_CLASS, type SetStatus } from "@/components/shared/status-pill";
import { getLabels } from "@/lib/services/label-service";
import { cn } from "@/lib/utils";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";
import { formatRelativeTime } from "@/lib/utils";
import { EditChannelSheet } from "@/components/channels/edit-channel-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteChannel } from "@/lib/actions/channel-actions";
import { EntityBadge } from "@/components/shared/entity-badge";
import { generateEntityVisual } from "@/lib/entity-visual";
import { ImportAliases } from "@/components/channels/import-aliases";
import { ChannelFolderInline } from "@/components/channels/channel-folder-inline";

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

const PIPELINE_LIMIT = 50;

// Highest confidence first, like the Career timeline's status pills.
const PIPELINE_PILLS: Array<{ status: ChannelPipelineStatus; pill: SetStatus }> = [
  { status: "APPROVED", pill: "approved" },
  { status: "REVIEWING", pill: "reviewing" },
  { status: "PENDING", pill: "pending" },
];

const PILL_FOR_STATUS: Partial<Record<StagingSetStatus, SetStatus>> = {
  APPROVED: "approved",
  REVIEWING: "reviewing",
  PENDING: "pending",
};

function formatIsoDate(date: Date | null): string {
  if (!date) return "????-??-??";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Deep link into /staging-sets narrowed to this channel's pipeline. Carries the
// channel's own tier: the workspace's default tier filter (A/B/C) would
// otherwise hide every staged set of a Low/Trash channel.
function stagingSetsHref(
  channel: { id: string; name: string; tier: string },
  isVideo: boolean,
  selectId?: string,
): string {
  const params = new URLSearchParams({
    status: "PENDING,REVIEWING,APPROVED",
    channelId: channel.id,
    channelLabel: channel.name,
    channelTier: channel.tier,
    type: isVideo ? "video" : "photo",
  });
  if (selectId) params.set("select", selectId);
  return `/staging-sets?${params.toString()}`;
}

// ── Main page ───────────────────────────────────────────────────────────────

export default async function ChannelDetailPage({
  params,
}: ChannelDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;

  const [channel, labels, pipeline] = await Promise.all([
    getChannelById(id),
    getLabels(),
    getChannelPipeline(id, PIPELINE_LIMIT),
  ]);

  if (!channel) notFound();

  const visual = generateEntityVisual(channel.name, "CHANNEL");
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
              shortName: channel.shortName,
              channelFolder: channel.channelFolder,
              labelId: channel.labelId,
              platform: channel.platform,
              url: channel.url,
              tier: channel.tier,
              setCount: channel.sets.length,
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
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm",
          "border-l-[3px]",
          visual.accentBorder,
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br",
            visual.cardGradient,
          )}
        />
        <div className="relative flex items-start gap-4">
          <EntityBadge visual={visual} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight">
              {channel.name}
              {channel.shortName && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  ({channel.shortName})
                </span>
              )}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(() => {
                const tc = CHANNEL_TIER_CONFIG.find((t) => t.value === channel.tier);
                return tc ? (
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', tc.border, tc.bg, tc.text)}>
                    {tc.letter} · {tc.label}
                  </span>
                ) : null;
              })()}
              {channel.label && (
                <Link
                  href={`/labels/${channel.label.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted hover:text-primary"
                >
                  <Building2 size={12} />
                  {channel.label.name}
                </Link>
              )}
              {channel.platform && (
                <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
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
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/20 bg-card/70 p-4 text-center shadow-md backdrop-blur-sm">
          <p className="text-2xl font-bold">{setCount}</p>
          <p className="text-xs text-muted-foreground">
            {setCount === 1 ? "Set" : "Sets"}
          </p>
        </div>
        <a
          href="#pipeline"
          className="rounded-2xl border border-white/20 bg-card/70 p-4 text-center shadow-md backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-2xl font-bold">{pipeline.total}</p>
          <p className="text-xs text-muted-foreground">In pipeline</p>
        </a>
      </div>

      {/* Archive Folder */}
      <SectionCard title="Archive Folder" icon={<HardDrive size={18} />}>
        <p className="mb-3 text-sm text-muted-foreground">
          Folder name used to build archive paths for this channel&apos;s sets.
        </p>
        <ChannelFolderInline
          channelId={channel.id}
          channelFolder={channel.channelFolder ?? null}
          suggestion={
            channel.shortName
              ? `${channel.shortName}-${channel.name}`
              : channel.name
          }
        />
      </SectionCard>

      {/* Import Aliases */}
      <SectionCard
        title="Import Aliases"
        icon={<FileInput size={18} />}
      >
        <ImportAliases channelId={channel.id} aliases={channel.importAliases} />
      </SectionCard>

      {/* In pipeline — staged sets not yet promoted */}
      <section id="pipeline" className="scroll-mt-20">
        <SectionCard
          title={`In pipeline (${pipeline.total})`}
          icon={<Layers size={18} />}
        >
          {pipeline.total === 0 ? (
            <div className="space-y-2">
              <EmptyState message="Nothing from this channel is waiting in the staging pipeline." />
              <Link
                href="/staging-sets"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Open Staging Sets
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Staged sets from this channel that are not promoted yet. They
                count as sets once promoted.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <ul className="flex flex-wrap items-center gap-2" aria-label="Pipeline by status">
                  {PIPELINE_PILLS.filter(({ status }) => pipeline.byStatus[status] > 0).map(
                    ({ status, pill }) => (
                      <li key={status} className="inline-flex items-center gap-1.5">
                        <StatusPill status={pill} />
                        <span className="text-sm font-semibold tabular-nums">
                          {pipeline.byStatus[status]}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {pipeline.photo > 0 && (
                    <Link
                      href={stagingSetsHref(channel, false)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ImageIcon size={12} aria-hidden="true" />
                      {pipeline.photo} photo {pipeline.photo === 1 ? "set" : "sets"}
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  )}
                  {pipeline.video > 0 && (
                    <Link
                      href={stagingSetsHref(channel, true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Video size={12} aria-hidden="true" />
                      {pipeline.video} {pipeline.video === 1 ? "video" : "videos"}
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>

              <ul className="space-y-2">
                {pipeline.items.map((item) => {
                  const pill = PILL_FOR_STATUS[item.status] ?? "pending";
                  return (
                    <li key={item.id}>
                      <Link
                        href={stagingSetsHref(channel, item.isVideo, item.id)}
                        className={cn(
                          "group flex items-center justify-between gap-3 rounded-xl border border-l-[3px] border-white/15 bg-card/40 px-4 py-2.5 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          STATUS_STRIPE_CLASS[pill],
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {item.isVideo ? (
                            <Video size={14} className="shrink-0 text-muted-foreground" aria-label="Video" />
                          ) : (
                            <ImageIcon size={14} className="shrink-0 text-muted-foreground" aria-label="Photo set" />
                          )}
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {formatIsoDate(item.releaseDate)}
                          </span>
                          <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                            {item.title}
                          </span>
                        </div>
                        <StatusPill status={pill} className="shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {pipeline.total > pipeline.items.length && (
                <p className="text-xs text-muted-foreground">
                  Showing the {pipeline.items.length} most recent of {pipeline.total}. Open the
                  photo or video link above for the full list.
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </section>

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
  });
}
