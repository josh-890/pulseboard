import Link from "next/link";
import { ArrowRight, FileInput, HardDrive, ImageIcon, Layers, Settings2, Video } from "lucide-react";
import type { StagingSetStatus } from "@/generated/prisma/client";
import { StatusPill, STATUS_STRIPE_CLASS, type SetStatus } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import { ImportAliases } from "@/components/channels/import-aliases";
import { ChannelFolderInline } from "@/components/channels/channel-folder-inline";
import { ChannelClosedSwitch } from "@/components/channels/channel-closed-switch";
import type { ChannelPipeline, ChannelPipelineStatus } from "@/lib/services/channel-service";

type ChannelManageTabProps = {
  channel: {
    id: string;
    name: string;
    shortName: string | null;
    tier: string;
    channelFolder: string | null;
    importAliases: string[];
    closed: boolean;
  };
  pipeline: ChannelPipeline;
};

// ── Pieces ──────────────────────────────────────────────────────────────────

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

// ── Manage tab ──────────────────────────────────────────────────────────────

/** How the channel is wired: archive folder, import aliases, the staging pipeline, closed */
export function ChannelManageTab({ channel, pipeline }: ChannelManageTabProps) {
  return (
    <div className="space-y-6">
      <SectionCard title="Status" icon={<Settings2 size={18} />}>
        <ChannelClosedSwitch channelId={channel.id} initialClosed={channel.closed} />
      </SectionCard>

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

    </div>
  );
}
