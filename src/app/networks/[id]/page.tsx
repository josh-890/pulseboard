import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, ExternalLink, Network, Radio } from "lucide-react";
import { getNetworkById } from "@/lib/services/network-service";
import { cn } from "@/lib/utils";
import { EditNetworkSheet } from "@/components/networks/edit-network-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteNetwork } from "@/lib/actions/network-actions";

export const dynamic = "force-dynamic";

type NetworkDetailPageProps = {
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

export default async function NetworkDetailPage({
  params,
}: NetworkDetailPageProps) {
  const { id } = await params;

  const network = await getNetworkById(id);

  if (!network) notFound();

  // Compute stats
  const totalLabels = network.labelMemberships.length;
  const totalChannels = network.labelMemberships.reduce(
    (sum, m) => sum + m.label.channelMaps.length,
    0,
  );
  const totalSets = network.labelMemberships.reduce(
    (sum, m) =>
      sum +
      m.label.channelMaps.reduce((cSum, cm) => cSum + cm.channel.sets.length, 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/networks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">←</span>
          Back to Networks
        </Link>
        <div className="flex items-center gap-2">
          <EditNetworkSheet network={network} />
          <DeleteButton
            title="Delete network?"
            description="This will permanently remove the network. Label memberships linked to this network will be removed. This action cannot be undone."
            onDelete={deleteNetwork.bind(null, id)}
            redirectTo="/networks"
          />
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Network size={22} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight">{network.name}</h1>
            {network.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {network.description}
              </p>
            )}
            {network.website && (
              <a
                href={network.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ExternalLink size={13} />
                {network.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Labels", value: totalLabels },
          { label: "Channels", value: totalChannels },
          { label: "Sets", value: totalSets },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/20 bg-card/70 p-4 text-center shadow-md backdrop-blur-sm"
          >
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Member Labels */}
      <SectionCard
        title={`Member Labels (${totalLabels})`}
        icon={<Building2 size={18} />}
      >
        {network.labelMemberships.length === 0 ? (
          <EmptyState message="No labels in this network." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {network.labelMemberships.map(({ label }) => {
              const channelCount = label.channelMaps.length;
              const setCount = label.channelMaps.reduce(
                (sum, cm) => sum + cm.channel.sets.length,
                0,
              );
              return (
                <Link
                  key={label.id}
                  href={`/labels/${label.id}`}
                  className="group flex items-center justify-between rounded-xl border border-white/15 bg-card/40 p-4 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 size={14} className="text-primary" />
                    </div>
                    <span className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                      {label.name}
                    </span>
                  </div>
                  <div className="ml-3 flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Radio size={11} />
                      {channelCount}
                    </span>
                    <span>{setCount} sets</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
