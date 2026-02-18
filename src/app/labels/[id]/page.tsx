import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink, Network, Radio, FolderKanban } from "lucide-react";
import { getLabelById } from "@/lib/services/label-service";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type LabelDetailPageProps = {
  params: Promise<{ id: string }>;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  paused:
    "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed:
    "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
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

export default async function LabelDetailPage({
  params,
}: LabelDetailPageProps) {
  const { id } = await params;

  const label = await getLabelById(id);

  if (!label) notFound();

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/labels"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span aria-hidden="true">←</span>
        Back to Labels
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Building2 size={22} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight">{label.name}</h1>
            {label.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {label.description}
              </p>
            )}
            {label.website && (
              <a
                href={label.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ExternalLink size={13} />
                {label.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Networks */}
      <SectionCard
        title={`Networks (${label.networks.length})`}
        icon={<Network size={18} />}
      >
        {label.networks.length === 0 ? (
          <EmptyState message="Not part of any networks." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {label.networks.map(({ network }) => (
              <Link
                key={network.id}
                href={`/networks/${network.id}`}
                className="inline-flex items-center rounded-full border border-white/20 bg-muted/60 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {network.name}
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Channels */}
      <SectionCard
        title={`Channels (${label.channels.length})`}
        icon={<Radio size={18} />}
      >
        {label.channels.length === 0 ? (
          <EmptyState message="No channels for this label." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {label.channels.map((channel) => (
              <div
                key={channel.id}
                className="rounded-xl border border-white/15 bg-card/40 p-4"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{channel.name}</span>
                  <div className="flex items-center gap-2">
                    {channel.platform && (
                      <span className="rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                        {channel.platform}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {channel.sets.length}{" "}
                      {channel.sets.length === 1 ? "set" : "sets"}
                    </span>
                  </div>
                </div>
                {channel.url && (
                  <a
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                  >
                    <ExternalLink size={11} />
                    {channel.url}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Projects */}
      <SectionCard
        title={`Projects (${label.projects.length})`}
        icon={<FolderKanban size={18} />}
      >
        {label.projects.length === 0 ? (
          <EmptyState message="No projects associated with this label." />
        ) : (
          <div className="space-y-2">
            {label.projects.map(({ project }) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group flex items-center justify-between rounded-xl border border-white/15 bg-card/40 px-4 py-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  {project.name}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    STATUS_STYLES[project.status],
                  )}
                >
                  {STATUS_LABELS[project.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
