import Link from "next/link";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getChannels } from "@/lib/services/channel-service";
import { getLabels } from "@/lib/services/label-service";
import {
  getChannelIntegrity,
  getNameOnlyLinks,
  getUnclaimedArchiveFolders,
} from "@/lib/services/channel-check-service";
import { ChannelCheckFolders } from "@/components/channels/channel-check-folders";
import { ChannelCheckNameLinks } from "@/components/channels/channel-check-name-links";
import { ChannelCheckIntegrity } from "@/components/channels/channel-check-integrity";

export const dynamic = "force-dynamic";

function Section({
  id,
  title,
  count,
  description,
  children,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default async function ChannelCheckPage() {
  return withTenantFromHeaders(async () => {
    const [folders, links, integrity, channels, labels] = await Promise.all([
      getUnclaimedArchiveFolders(),
      getNameOnlyLinks(),
      getChannelIntegrity(),
      getChannels(),
      getLabels(),
    ]);
    const labelOptions = labels.map(({ id, name }) => ({ id, name }));
    const channelOptions = channels.map((c) => ({
      id: c.id,
      label: c.name,
      description: c.shortName ?? undefined,
    }));

    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <Link
            href="/channels"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <ArrowLeft size={14} aria-hidden /> Channels
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-channel/15">
              <ShieldCheck size={20} className="text-entity-channel" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Channel check</h1>
              <p className="text-sm text-muted-foreground">
                A channel name links to a channel only through an import alias you set — each item is decided on its own.
              </p>
            </div>
          </div>
        </div>

        <Section
          id="check-folders"
          title="Archive folders no channel claims"
          count={folders.length}
          description="Channel folders in your archive that no channel names as its archive folder."
        >
          <ChannelCheckFolders folders={folders} labels={labelOptions} />
        </Section>

        <Section
          id="check-name-links"
          title="Linked by name only"
          count={links.length}
          description="Staged sets took these channels because the names were alike — no import alias anchors them yet."
        >
          <ChannelCheckNameLinks links={links} />
        </Section>

        <Section
          id="check-integrity"
          title="Sets and staged sets without a channel"
          count={integrity.archivedNoChannel.length + integrity.stagedNoChannel.length}
          description="Nothing archived or staged should be without a channel."
        >
          <ChannelCheckIntegrity integrity={integrity} channels={channelOptions} labels={labelOptions} />
        </Section>
      </div>
    );
  });
}
