import { withTenantFromHeaders } from "@/lib/tenant-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Tag, FileText } from "lucide-react";
import { getSetById, getChannelsForSelect } from "@/lib/services/set-service";
import { getSetMediaGallery, getCoverPhotosForSets, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getHeroBackdropEnabled } from "@/lib/services/setting-service";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";
import { SetDetailGallery } from "@/components/sets/set-detail-gallery";
import { CreditResolutionPanel } from "@/components/sets/credit-resolution-panel";
import { cn } from "@/lib/utils";
import { getEntityTags } from "@/lib/services/entity-tag-service";
import { EditSetSheet } from "@/components/sets/edit-set-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { AddCreditInline } from "@/components/sets/add-credit-inline";
import { SetInlineDescription, SetInlineNotes } from "@/components/sets/set-detail-header";
import { deleteSet } from "@/lib/actions/set-actions";
import { SetHero } from "@/components/sets/set-hero";
import { LabelEvidenceManager } from "@/components/sets/label-evidence-manager";
import { SetArchivePanel } from "@/components/sets/set-archive-panel";


export const dynamic = "force-dynamic";

type SetDetailPageProps = {
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

// ── Main page ───────────────────────────────────────────────────────────────

export default async function SetDetailPage({ params }: SetDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;

  const [set, channels, roleGroups, setEntityTags, backdropEnabled] = await Promise.all([
    getSetById(id),
    getChannelsForSelect(),
    getAllContributionRoleGroups(),
    getEntityTags("SET", id),
    getHeroBackdropEnabled(),
  ]);

  if (!set) notFound();

  const setTags = setEntityTags.map((t) => ({
    id: t.id,
    name: t.name,
    group: t.group,
  }));

  // Strip participants from setData for RSC safety (client components receive slim props)
  // but keep participants for the SetHero (server component)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { participants: _participants, ...setData } = set;
  const participants = set.participants;

  // Load gallery items + hero data in parallel
  const participantIds = participants.map((p) => p.personId);
  const [galleryItems, coverPhotoMap, headshotMap] = await Promise.all([
    getSetMediaGallery(id, setData.coverMediaItemId),
    getCoverPhotosForSets([id]),
    getHeadshotsForPersons(participantIds),
  ]);
  const coverPhoto = coverPhotoMap.get(id) ?? null;

  // Determine if we have credits
  const hasCredits = setData.creditsRaw.length > 0;
  const unresolvedCount = setData.creditsRaw.filter((c) => c.resolutionStatus === "UNRESOLVED").length;
  const hasPhotos = galleryItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/sets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">←</span>
          Back to Sets
        </Link>
        <div className="flex items-center gap-2">
          <EditSetSheet
            set={{
              id: setData.id,
              type: setData.type,
              title: setData.title,
              channelId: setData.channelId,
              description: setData.description,
              notes: setData.notes,
              releaseDate: setData.releaseDate,
              releaseDatePrecision: setData.releaseDatePrecision,
              category: setData.category,
              genre: setData.genre,
              tags: setData.tags,
              isCompilation: setData.isCompilation,
              isComplete: setData.isComplete,
              imageCount: setData.imageCount,
              videoLength: setData.videoLength,
              externalId: setData.externalId,
            }}
            channels={channels}
            entityTags={setTags}
          />
          <DeleteButton
            title="Delete set?"
            description="This will permanently remove the set and all credits. This action cannot be undone."
            onDelete={deleteSet.bind(null, id)}
            redirectTo="/sets"
          />
        </div>
      </div>

      {/* Hero card */}
      <SetHero
        set={set}
        coverPhoto={coverPhoto}
        headshotMap={headshotMap}
        backdropEnabled={backdropEnabled}
        mediaCount={galleryItems.length}
      />

      {/* Description + notes (inline editable) */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-3">
        <SetInlineDescription setId={id} description={setData.description} />
        <SetInlineNotes setId={id} notes={setData.notes} />
      </div>

      {/* Photo gallery */}
      <SetDetailGallery
        items={galleryItems}
        entityId={id}
        primarySessionId={setData.sessionLinks?.find((l) => l.isPrimary)?.sessionId}
        coverMediaItemId={setData.coverMediaItemId}
        setType={setData.type as "photo" | "video"}
        isCompilation={setData.isCompilation}
        sessionLinks={setData.sessionLinks?.map((l) => ({
          sessionId: l.sessionId,
          sessionName: l.session.name,
          sessionDate: l.session.date,
          isPrimary: l.isPrimary,
        }))}
      />

      {/* Credits & Participants */}
      <SectionCard
        title={hasCredits ? `Credits (${setData.creditsRaw.length})` : "Credits"}
        icon={<FileText size={18} />}
      >
        <div className="space-y-4">
          <LabelEvidenceManager
            setId={id}
            evidence={set.labelEvidence.map((ev) => ({
              setId: ev.setId,
              labelId: ev.labelId,
              evidenceType: ev.evidenceType,
              label: { id: ev.label.id, name: ev.label.name },
            }))}
          />
          <AddCreditInline
            setId={id}
            roleDefinitions={roleGroups.flatMap((g) =>
              g.definitions.map((d) => ({ id: d.id, name: d.name, groupName: g.name })),
            )}
          />
          {hasCredits ? (
            <CreditResolutionPanel
              setId={id}
              channelId={setData.channelId}
              credits={setData.creditsRaw.map((c) => ({
                id: c.id,
                roleDefinitionId: c.roleDefinitionId ?? null,
                roleName: c.roleDefinition?.name ?? null,
                rawName: c.rawName,
                resolutionStatus: c.resolutionStatus,
                resolvedPerson: c.resolvedPerson
                  ? {
                      id: c.resolvedPerson.id,
                      icgId: c.resolvedPerson.icgId,
                      aliases: c.resolvedPerson.aliases.map((a) => ({
                        name: a.name,
                        isCommon: a.isCommon,
                      })),
                    }
                  : null,
                resolvedArtist: c.resolvedArtist
                  ? { id: c.resolvedArtist.id, name: c.resolvedArtist.name }
                  : null,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No credits yet. Add credits to track contributors.
            </p>
          )}
        </div>
      </SectionCard>

      {/* Archive & Media Queue */}
      <SetArchivePanel
        setId={id}
        isVideo={setData.type === 'video'}
        archivePath={setData.archivePath ?? null}
        archiveStatus={setData.archiveStatus}
        archiveLastChecked={setData.archiveLastChecked ?? null}
        archiveFileCount={setData.archiveFileCount ?? null}
        archiveFileCountPrev={setData.archiveFileCountPrev ?? null}
        archiveVideoPresent={setData.archiveVideoPresent ?? null}
        mediaPriority={setData.mediaPriority ?? null}
        mediaQueueAt={setData.mediaQueueAt ?? null}
      />

      {/* Tags */}
      {setData.tags.length > 0 && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <Tag size={16} className="text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {setData.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
    );
  });
}
