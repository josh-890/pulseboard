import { withTenantFromHeaders } from "@/lib/tenant-context";
import { TrailScope } from "@/components/shared/trail-scope";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Camera, LayoutDashboard, Link2, NotebookPen, Tag, UserPen } from "lucide-react";
import { brandOf } from "@/lib/services/brand-of";
import { getArtistById, getArtistChannels, getArtistHeroStats } from "@/lib/services/artist-service";
import { getWaitingCredits } from "@/lib/services/artist-credit-service";
import { getEffectiveTags } from "@/lib/services/tag-effective-service";
import { getMakerFaces, getMakerKnownFor, getMakerOverviewShowcase } from "@/lib/services/maker-showcase-service";
import { getArtistWall } from "@/lib/services/channel-wall-service";
import { deleteArtistAction, setArtistTextAction } from "@/lib/actions/artist-actions";
import { getMakerShowcaseAction } from "@/lib/actions/maker-actions";
import { DeleteButton } from "@/components/shared/delete-button";
import { BrandMarkEditor } from "@/components/shared/brand-mark-editor";
import { EntityTabBar, type EntityTab } from "@/components/shared/entity-tab-bar";
import { MarkdownNoteCard } from "@/components/shared/markdown-note-card";
import { MakerFacesRow } from "@/components/shared/maker-faces-row";
import { EntityTagsPanel } from "@/components/tags";
import { KnownForRow, ShowcaseMosaic } from "@/components/people/overview";
import { ChannelSetWall, WALL_PAGE } from "@/components/channels/channel-set-wall";
import { ArtistHero } from "@/components/artists/artist-hero";
import { ArtistEditButton } from "@/components/artists/artist-edit-button";
import { ArtistChannelsRow } from "@/components/artists/artist-channels-row";
import { ArtistAliases } from "@/components/artists/artist-aliases";
import { ArtistWaitingCredits } from "@/components/artists/artist-waiting-credits";

export const dynamic = "force-dynamic";

type ArtistDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; type?: string; sort?: string; limit?: string }>;
};

const TAB_KEYS = ["overview", "sets", "credits"] as const;
type TabKey = (typeof TAB_KEYS)[number];

function SectionCard({ title, icon, hint, children }: { title: string; icon: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {hint && <p className="mb-4 mt-1 text-sm text-muted-foreground">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default async function ArtistDetailPage({ params, searchParams }: ArtistDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const [{ id }, sp] = await Promise.all([params, searchParams]);
    const tab: TabKey = TAB_KEYS.find((k) => k === sp.tab) ?? "overview";

    const [artist, stats, waiting] = await Promise.all([getArtistById(id), getArtistHeroStats(id), getWaitingCredits(id)]);
    if (!artist) notFound();

    const scope = { kind: "artist" as const, id };
    const [tags, showcase, knownFor, faces, channels] =
      tab === "overview"
        ? await Promise.all([
            getEffectiveTags("ARTIST", id),
            getMakerOverviewShowcase(scope),
            getMakerKnownFor(scope),
            getMakerFaces(scope),
            getArtistChannels(id),
          ])
        : [[], null, [], [], []];
    const wall = tab === "sets" ? await getArtistWall(id) : null;

    const brand = brandOf(artist);
    const base = `/artists/${artist.id}`;
    const tabs: EntityTab[] = [
      { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
      { key: "sets", label: "Sets", icon: <Camera size={14} />, count: stats.photoSets + stats.videoSets },
      {
        key: "credits",
        label: "Names & credits",
        icon: <Link2 size={14} />,
        count: waiting.length || undefined,
        attention: waiting.some((c) => c.exact && !c.ambiguous),
      },
    ];

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/artists"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span aria-hidden="true">&larr;</span>
            Back to Artists
          </Link>
          <div className="flex items-center gap-2">
            <BrandMarkEditor kind="artist" id={artist.id} brand={brand} />
            <ArtistEditButton artist={artist} />
            <DeleteButton
              title={`Delete ${artist.name}`}
              description="This will permanently delete this artist and unresolve all linked credits."
              onDelete={deleteArtistAction.bind(null, artist.id)}
              redirectTo="/artists"
            />
          </div>
        </div>

        <ArtistHero artist={artist} brand={brand} stats={stats} />

        <EntityTabBar tabs={tabs} active={tab} basePath={base} />

        {tab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {showcase && showcase.items.length > 0 ? (
              <ShowcaseMosaic showcase={showcase} title={artist.name} owner="their" load={getMakerShowcaseAction.bind(null, "artist", artist.id)} />
            ) : (
              <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-muted-foreground md:col-span-2">
                No photos yet — the Showcase fills itself from the photos of the sets credited to them.
                {waiting.length > 0 && (
                  <>
                    {" "}
                    <Link href={`${base}?tab=credits`} className="text-primary underline-offset-2 hover:underline">
                      {waiting.length} credit{waiting.length === 1 ? "" : "s"} may be theirs
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
            <TrailScope title={`${artist.name} · Known for`}>
              <KnownForRow sets={knownFor} />
            </TrailScope>
            <TrailScope title={`${artist.name} · Models shot most`}>
              <MakerFacesRow title="Models shot most" faces={faces} />
            </TrailScope>
            <TrailScope title={`${artist.name} · Channels`}>
              <ArtistChannelsRow channels={channels} />
            </TrailScope>
            <MarkdownNoteCard
              title="About"
              icon={<BookOpen size={16} />}
              initialText={artist.bio}
              onSave={setArtistTextAction.bind(null, artist.id, "bio")}
              emptyHint="Add a few lines: their style, what they are known for…"
            />
            <MarkdownNoteCard
              title="Notes"
              icon={<NotebookPen size={16} />}
              initialText={artist.notes}
              onSave={setArtistTextAction.bind(null, artist.id, "notes")}
              emptyHint="Your own notes on this artist…"
            />
            <section className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm md:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Tag size={16} className="text-muted-foreground" aria-hidden="true" />
                Tags
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <EntityTagsPanel entityType="ARTIST" entityId={artist.id} initialTags={tags} />
              </div>
            </section>
          </div>
        )}

        {tab === "sets" && wall && (
          <TrailScope title={`${artist.name} · Sets`}>
            <ChannelSetWall
              wall={wall}
              scope="library"
              type={sp.type === "photo" || sp.type === "video" ? sp.type : "any"}
              sort={sp.sort === "oldest" || sp.sort === "rating" ? sp.sort : "newest"}
              limit={Math.max(WALL_PAGE, Math.min(Number(sp.limit) || WALL_PAGE, 20_000))}
              basePath={`${base}?tab=sets`}
              libraryOnly
            />
          </TrailScope>
        )}

        {tab === "credits" && (
          <div className="space-y-5">
            <SectionCard
              title="Also credited as"
              icon={<UserPen size={18} />}
              hint="Other names they appear under. A credit with exactly one of these names — or their own, and no other artist's — links to them by itself, now and on every import."
            >
              <ArtistAliases artistId={artist.id} aliases={artist.aliases} />
            </SectionCard>
            <SectionCard
              title="Credits that may be theirs"
              icon={<Link2 size={18} />}
              hint="Behind-camera credits not yet linked to anyone: the same name first (green), then similar names (amber) — decide each."
            >
              <ArtistWaitingCredits artistId={artist.id} credits={waiting} />
            </SectionCard>
          </div>
        )}
      </div>
    );
  });
}
