import { withTenantFromHeaders } from "@/lib/tenant-context";
import { TrailScope } from "@/components/shared/trail-scope";
import { withVia } from "@/lib/browse-trail";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TrailHeaderRow } from "@/components/shared/trail-header-row";
import { RecordRecent } from "@/components/shared/record-recent";
import { BookOpen, Camera, FolderKanban, LayoutDashboard, NotebookPen, Radio, Tag, Users } from "lucide-react";
import { getLabelById, getLabelChannels, getLabelHeroStats } from "@/lib/services/label-service";
import { getEffectiveTags } from "@/lib/services/tag-effective-service";
import { labelBrandOf } from "@/lib/services/brand-of";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";
import { EditLabelSheet } from "@/components/labels/edit-label-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteLabel, setLabelTextAction } from "@/lib/actions/label-actions";
import { AddChannelSheet } from "@/components/channels/add-channel-sheet";
import { BrandMarkEditor } from "@/components/shared/brand-mark-editor";
import { LabelHero } from "@/components/labels/label-hero";
import { LabelChannelTiles } from "@/components/labels/label-channel-tiles";
import { EntityTabBar, type EntityTab } from "@/components/shared/entity-tab-bar";
import { MarkdownNoteCard } from "@/components/shared/markdown-note-card";
import { EntityTagsPanel } from "@/components/tags";
import { KnownForRow, ShowcaseMosaic } from "@/components/people/overview";
import { MakerFacesRow } from "@/components/shared/maker-faces-row";
import { getMakerFaces, getMakerKnownFor, getMakerOverviewShowcase } from "@/lib/services/maker-showcase-service";
import { getMakerShowcaseAction } from "@/lib/actions/maker-actions";
import { getChannelModels, getLabelWall } from "@/lib/services/channel-wall-service";
import { ChannelSetWall, WALL_PAGE } from "@/components/channels/channel-set-wall";
import { ChannelModels, MODELS_PAGE } from "@/components/channels/channel-models";

export const dynamic = "force-dynamic";

type LabelDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; via?: string; scope?: string; type?: string; sort?: string; who?: string; limit?: string }>;
};

const TAB_KEYS = ["overview", "channels", "sets", "models", "projects"] as const;
type TabKey = (typeof TAB_KEYS)[number];

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

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
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

export default async function LabelDetailPage({ params, searchParams }: LabelDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const [{ id }, sp] = await Promise.all([params, searchParams]);
    const tab: TabKey = TAB_KEYS.find((k) => k === sp.tab) ?? "overview";

    const [label, stats] = await Promise.all([getLabelById(id), getLabelHeroStats(id)]);
    if (!label) notFound();

    const scope = { kind: "label" as const, id };
    const [tags, showcase, knownFor, faces] =
      tab === "overview"
        ? await Promise.all([getEffectiveTags("LABEL", id), getMakerOverviewShowcase(scope), getMakerKnownFor(scope), getMakerFaces(scope)])
        : [[], null, [], []];
    const channels = tab === "channels" ? await getLabelChannels(id) : [];
    const wall = tab === "sets" || tab === "models" ? await getLabelWall(id, "all") : null;
    const models = tab === "models" && wall ? await getChannelModels(wall) : null;

    const brand = labelBrandOf(label);
    const base = `/labels/${label.id}`;
    const tabs: EntityTab[] = [
      { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
      { key: "channels", label: "Channels", icon: <Radio size={14} />, count: stats.channels },
      { key: "sets", label: "Sets", icon: <Camera size={14} />, count: stats.photoSets + stats.videoSets },
      { key: "models", label: "Models", icon: <Users size={14} />, count: stats.models },
      ...(label.projects.length > 0
        ? [{ key: "projects", label: "Projects", icon: <FolderKanban size={14} />, count: label.projects.length }]
        : []),
    ];

    return (
      <div className="space-y-5">
        {/* Back link + actions row */}
        <RecordRecent type="label" id={label.id} name={label.name} />
        <TrailHeaderRow
          entityType="label"
          entityId={label.id}
          fallbackBack={
              <Link
                href="/labels"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span aria-hidden="true">&larr;</span>
                Back to Labels
              </Link>
          }
          actions={
            <>
            <BrandMarkEditor kind="label" id={label.id} brand={brand} />
            <EditLabelSheet label={label} />
            <DeleteButton
              title="Delete label?"
              description="This will permanently remove the label. Channels and projects linked to this label will be affected. This action cannot be undone."
              onDelete={deleteLabel.bind(null, id)}
              redirectTo="/labels"
            />
            </>
          }
        />

        <LabelHero label={label} brand={brand} stats={stats} />

        <EntityTabBar tabs={tabs} active={tab} basePath={base} via={sp.via} />

        {tab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {showcase && showcase.items.length > 0 ? (
              <ShowcaseMosaic showcase={showcase} title={label.name} owner="its channels'" load={getMakerShowcaseAction.bind(null, "label", label.id)} />
            ) : (
              <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-muted-foreground md:col-span-2">
                No photos yet — the Showcase fills itself from the photos of its channels&apos; sets.
              </p>
            )}
            <TrailScope title={`${label.name} · Known for`}>
              <KnownForRow sets={knownFor} />
            </TrailScope>
            <TrailScope title={`${label.name} · Faces`}>
              <MakerFacesRow title="Faces of the label" faces={faces} moreHref={`${base}?tab=models`} />
            </TrailScope>
            <MarkdownNoteCard
              title="About"
              icon={<BookOpen size={16} />}
              initialText={label.description}
              onSave={setLabelTextAction.bind(null, label.id, "description")}
              emptyHint="Add a few lines: who they are, their style…"
            />
            <MarkdownNoteCard
              title="Notes"
              icon={<NotebookPen size={16} />}
              initialText={label.notes}
              onSave={setLabelTextAction.bind(null, label.id, "notes")}
              emptyHint="Your own notes on this label…"
            />
            <section className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm md:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Tag size={16} className="text-muted-foreground" aria-hidden="true" />
                Tags
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <EntityTagsPanel entityType="LABEL" entityId={label.id} initialTags={tags} />
              </div>
            </section>
          </div>
        )}

        {tab === "channels" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">The channels {label.name} owns, most sets first.</p>
              <AddChannelSheet labels={[{ id: label.id, name: label.name }]} defaultLabelId={label.id} />
            </div>
            <TrailScope title={`${label.name} · Channels`}>
              <LabelChannelTiles channels={channels} />
            </TrailScope>
          </div>
        )}

        {tab === "sets" && wall && (
          <TrailScope title={`${label.name} · Sets`}>
            <ChannelSetWall
              wall={wall}
              scope={sp.scope === "all" ? "all" : "library"}
              type={sp.type === "photo" || sp.type === "video" ? sp.type : "any"}
              sort={sp.sort === "oldest" || sp.sort === "rating" ? sp.sort : "newest"}
              limit={Math.max(WALL_PAGE, Math.min(Number(sp.limit) || WALL_PAGE, 20_000))}
              basePath={withVia(`${base}?tab=sets`, sp.via ?? null)}
            />
          </TrailScope>
        )}

        {tab === "models" && models && (
          <TrailScope title={`${label.name} · Models`}>
            <ChannelModels
              models={models}
              filter={sp.who === "library" || sp.who === "persons" || sp.who === "contacts" ? sp.who : "all"}
              limit={Math.max(MODELS_PAGE, Math.min(Number(sp.limit) || MODELS_PAGE, 20_000))}
              basePath={withVia(`${base}?tab=models`, sp.via ?? null)}
            />
          </TrailScope>
        )}

        {tab === "projects" && (
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
        )}
      </div>
    );
  });
}
