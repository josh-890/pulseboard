import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { SetBrowseNavBar, SetBrowseBackLink } from "@/components/sets/set-browse-nav-bar";
import { getSetById, getChannelsForSelect } from "@/lib/services/set-service";
import { getSetMediaGallery, getCoverPhotosForSets, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getHeroBackdropEnabled } from "@/lib/services/setting-service";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";
import { SetDetailGallery } from "@/components/sets/set-detail-gallery";
import { getEntityTags } from "@/lib/services/entity-tag-service";
import { EditSetSheet } from "@/components/sets/edit-set-sheet";
import { deleteSet } from "@/lib/actions/set-actions";
import { SetActionsMenu } from "@/components/sets/set-actions-menu";
import { SetHero } from "@/components/sets/set-hero";
import { SetArchivePanel } from "@/components/sets/set-archive-panel";
import { SetAboutCard } from "@/components/sets/set-about-card";
import { CreditsPanel } from "@/components/sets/credits-panel";
import { getArchiveSuggestionsForSet } from "@/lib/services/archive-service";


export const dynamic = "force-dynamic";

type SetDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SetDetailPage({ params }: SetDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;

    const [set, channels, roleGroups, setEntityTags, backdropEnabled, archiveSuggestions] = await Promise.all([
      getSetById(id),
      getChannelsForSelect(),
      getAllContributionRoleGroups(),
      getEntityTags("SET", id),
      getHeroBackdropEnabled(),
      getArchiveSuggestionsForSet(id),
    ]);

    if (!set) notFound();

    const setTags = setEntityTags.map((t) => ({
      id: t.id,
      name: t.name,
      group: t.group,
    }));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { participants: _participants, ...setData } = set;
    const participants = set.participants;

    const participantIds = participants.map((p) => p.personId);
    const [galleryItems, coverPhotoMap, headshotMap] = await Promise.all([
      getSetMediaGallery(id, setData.coverMediaItemId),
      getCoverPhotosForSets([id]),
      getHeadshotsForPersons(participantIds),
    ]);
    const coverPhoto = coverPhotoMap.get(id) ?? null;

    // Derive archive state
    const al = setData.archiveLinks[0] ?? null;
    const archiveStatus = al?.archiveStatus ?? "UNKNOWN";
    const archiveFileCount = al?.archiveFileCount ?? null;
    const hasSuggestion = archiveSuggestions.length > 0;
    const showArchivePanel = archiveStatus !== "OK" || hasSuggestion;

    const roleDefinitions = roleGroups.flatMap((g) =>
      g.definitions.map((d) => ({ id: d.id, name: d.name, groupName: g.name })),
    );

    const credits = setData.creditsRaw.map((c) => ({
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
    }));

    const labelEvidence = set.labelEvidence.map((ev) => ({
      setId: ev.setId,
      labelId: ev.labelId,
      evidenceType: ev.evidenceType,
      label: { id: ev.label.id, name: ev.label.name },
    }));

    return (
      <div className="space-y-6">
        {/* Back link + browse nav + actions row */}
        <div className="grid grid-cols-3 items-center gap-4">
          <div className="flex items-center">
            <SetBrowseBackLink />
          </div>
          <div className="flex justify-center">
            <Suspense fallback={null}>
              <SetBrowseNavBar setId={id} />
            </Suspense>
          </div>
          <div className="flex items-center justify-end gap-2">
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
            <SetActionsMenu
              setId={id}
              setTitle={setData.title}
              setType={setData.type}
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
          archiveStatus={archiveStatus}
          archiveFileCount={archiveFileCount}
          hasSuggestion={hasSuggestion}
        />

        {/* About card — hidden when description + notes both empty */}
        <SetAboutCard setId={id} description={setData.description} notes={setData.notes} />

        {/* 2-column layout: gallery left, metadata sidebar right */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px] items-start">
          {/* Left column: gallery */}
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

          {/* Right sidebar: credits + tags + archive (when needed) */}
          <div className="space-y-6">
            <CreditsPanel
              setId={id}
              channelId={setData.channelId}
              credits={credits}
              labelEvidence={labelEvidence}
              roleDefinitions={roleDefinitions}
            />

            {setData.tags.length > 0 && (
              <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Tag size={14} className="text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-sm font-semibold">Tags</h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
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

            {showArchivePanel && (
              <SetArchivePanel
                setId={id}
                isVideo={setData.type === "video"}
                archiveLinkId={al?.id ?? null}
                archiveFolderId={al?.archiveFolder?.id ?? null}
                archivePath={al?.archivePath ?? null}
                archiveStatus={archiveStatus}
                archiveLastChecked={al?.archiveLastChecked ?? null}
                archiveFileCount={al?.archiveFileCount ?? null}
                archiveFileCountPrev={al?.archiveFileCountPrev ?? null}
                archiveVideoPresent={al?.archiveVideoPresent ?? null}
                archiveVideoFiles={al?.archiveVideoFiles ? (JSON.parse(al.archiveVideoFiles) as string[]) : null}
                archiveVideoFilename={al?.archiveVideoFilename ?? null}
                mediaPriority={setData.mediaPriority ?? null}
                mediaQueueAt={setData.mediaQueueAt ?? null}
                archiveSuggestions={archiveSuggestions}
              />
            )}
          </div>
        </div>
      </div>
    );
  });
}
