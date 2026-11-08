import { withTenantFromHeaders } from "@/lib/tenant-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Camera, LayoutDashboard, NotebookPen, Settings2, Tag, Users } from "lucide-react";
import {
  getChannelById,
  getChannelHeroStats,
  getChannelPipeline,
} from "@/lib/services/channel-service";
import { getLabels } from "@/lib/services/label-service";
import { getEffectiveTags } from "@/lib/services/tag-effective-service";
import { brandOf } from "@/lib/services/brand-of";
import { EditChannelSheet } from "@/components/channels/edit-channel-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteChannel, setChannelTextAction } from "@/lib/actions/channel-actions";
import { BrandMarkEditor } from "@/components/shared/brand-mark-editor";
import { ChannelHero } from "@/components/channels/channel-hero";
import { ChannelManageTab } from "@/components/channels/channel-manage-tab";
import { EntityTabBar, type EntityTab } from "@/components/shared/entity-tab-bar";
import { MarkdownNoteCard } from "@/components/shared/markdown-note-card";
import { EntityTagsPanel } from "@/components/tags";
import { KnownForRow, ShowcaseMosaic } from "@/components/people/overview";
import { MakerFacesRow } from "@/components/shared/maker-faces-row";
import { getMakerFaces, getMakerKnownFor, getMakerOverviewShowcase } from "@/lib/services/maker-showcase-service";
import { getMakerShowcaseAction } from "@/lib/actions/maker-actions";
import { getChannelModels, getChannelWall } from "@/lib/services/channel-wall-service";
import { ChannelSetWall, WALL_PAGE } from "@/components/channels/channel-set-wall";
import { ChannelModels, MODELS_PAGE } from "@/components/channels/channel-models";

export const dynamic = "force-dynamic";

type ChannelDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; scope?: string; type?: string; sort?: string; who?: string; limit?: string }>;
};

const TAB_KEYS = ["overview", "sets", "models", "manage"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const PIPELINE_LIMIT = 50;

// ── Main page ───────────────────────────────────────────────────────────────

export default async function ChannelDetailPage({ params, searchParams }: ChannelDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const [{ id }, sp] = await Promise.all([params, searchParams]);
    const tab: TabKey = TAB_KEYS.find((k) => k === sp.tab) ?? "overview";

    const [channel, labels, pipeline, stats] = await Promise.all([
      getChannelById(id),
      getLabels(),
      getChannelPipeline(id, PIPELINE_LIMIT),
      getChannelHeroStats(id),
    ]);
    if (!channel) notFound();

    const scope = { kind: "channel" as const, id };
    const [tags, showcase, knownFor, faces] =
      tab === "overview"
        ? await Promise.all([
            getEffectiveTags("CHANNEL", id),
            getMakerOverviewShowcase(scope),
            getMakerKnownFor(scope),
            getMakerFaces(scope),
          ])
        : [[], null, [], []];
    // The Sets and Models tabs both stand on the channel's whole output
    const wall = tab === "sets" || tab === "models" ? await getChannelWall(id, "all") : null;
    const models = tab === "models" && wall ? await getChannelModels(wall) : null;
    const brand = brandOf(channel);
    const labelOptions = labels.map(({ id, name }) => ({ id, name }));
    const tabs: EntityTab[] = [
      { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
      { key: "sets", label: "Sets", icon: <Camera size={14} />, count: channel.sets.length },
      { key: "models", label: "Models", icon: <Users size={14} />, count: stats.models },
      { key: "manage", label: "Manage", icon: <Settings2 size={14} />, count: pipeline.total || undefined },
    ];

    return (
      <div className="space-y-5">
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
            <BrandMarkEditor kind="channel" id={channel.id} brand={brand} />
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

        <ChannelHero
          channel={channel}
          brand={brand}
          label={channel.label ? { id: channel.label.id, name: channel.label.name, brand: brandOf(channel.label) } : null}
          stats={stats}
        />

        <EntityTabBar tabs={tabs} active={tab} basePath={`/channels/${channel.id}`} />

        {tab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {showcase && showcase.items.length > 0 ? (
              <ShowcaseMosaic
                showcase={showcase}
                title={channel.name}
                owner="its"
                load={getMakerShowcaseAction.bind(null, "channel", channel.id)}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-muted-foreground md:col-span-2">
                No photos yet — the Showcase fills itself from the photos of this channel&apos;s sets.
              </p>
            )}
            <KnownForRow sets={knownFor} hideChannel />
            <MakerFacesRow title="Faces of the channel" faces={faces} moreHref={`/channels/${channel.id}?tab=models`} />
            <MarkdownNoteCard
              title="About"
              icon={<BookOpen size={16} />}
              initialText={channel.profile}
              onSave={setChannelTextAction.bind(null, channel.id, "profile")}
              emptyHint="Add a few lines: its style, what it is known for…"
            />
            <MarkdownNoteCard
              title="Notes"
              icon={<NotebookPen size={16} />}
              initialText={channel.notes}
              onSave={setChannelTextAction.bind(null, channel.id, "notes")}
              emptyHint="Your own notes on this channel…"
            />
            <section className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm md:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Tag size={16} className="text-muted-foreground" aria-hidden="true" />
                Tags
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <EntityTagsPanel entityType="CHANNEL" entityId={channel.id} initialTags={tags} />
              </div>
            </section>
          </div>
        )}

        {tab === "sets" && wall && (
          <ChannelSetWall
            wall={wall}
            scope={sp.scope === "all" ? "all" : "library"}
            type={sp.type === "photo" || sp.type === "video" ? sp.type : "any"}
            sort={sp.sort === "oldest" || sp.sort === "rating" ? sp.sort : "newest"}
            limit={Math.max(WALL_PAGE, Math.min(Number(sp.limit) || WALL_PAGE, 20_000))}
            basePath={`/channels/${channel.id}?tab=sets`}
          />
        )}

        {tab === "models" && models && (
          <ChannelModels
            models={models}
            filter={sp.who === "persons" || sp.who === "contacts" ? sp.who : "all"}
            limit={Math.max(MODELS_PAGE, Math.min(Number(sp.limit) || MODELS_PAGE, 20_000))}
            basePath={`/channels/${channel.id}?tab=models`}
          />
        )}

        {tab === "manage" && <ChannelManageTab channel={channel} pipeline={pipeline} />}
      </div>
    );
  });
}
