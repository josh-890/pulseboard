import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BrowseNavBar, BrowseBackLink } from "@/components/people/browse-nav-bar";
import {
  getPersonWithDetails,
  getPersonWorkHistory,
  getPersonConnections,
  getPersonSessionWorkHistory,
  getPersonProductionSessions,
  deriveCurrentState,
  deriveAffiliations,
} from "@/lib/services/person-service";
import { getProfileImageLabels, getSkillLevelConfigs } from "@/lib/services/setting-service";
import { getPersonReferenceSession } from "@/lib/services/session-service";
import { getPersonHeadshots, getPersonMediaGallery, getPersonEntityMedia, getHeadshotsForPersons } from "@/lib/services/media-service";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";
import { getAllCategoryGroups, getPopulatedCategoriesForPerson, ensureEntityCategories } from "@/lib/services/category-service";
import { getAllSkillGroups } from "@/lib/services/skill-catalog-service";
import { getAllPhysicalAttributeGroups } from "@/lib/services/physical-attribute-catalog-service";
import { getPersonAliases } from "@/lib/services/alias-service";
import { getPersonDigitalIdentities } from "@/lib/services/digital-identity-service";
import { getPersonResearch } from "@/lib/services/research-service";
import { getStagingWorkHistoryForPerson } from "@/lib/services/import/staging-set-service";
import { getEntityTags } from "@/lib/services/entity-tag-service";
import { getPersonEraContributions } from "@/lib/services/era-service";
import {
  getCareerTimeline,
  getCareerStats,
  getCareerFacetCounts,
  getCareerChannelsForPerson,
  getCareerErasForPerson,
  type CareerSort,
  type CareerArchiveStatusBucket,
} from "@/lib/services/career-service";
import { PersonDetailTabs } from "@/components/people/person-detail-tabs";
import { computePlausibilityIssues } from "@/lib/services/plausibility-service";
import { EditPersonSheet } from "@/components/people/edit-person-sheet";
import { PersonActionsMenu } from "@/components/people/person-actions-menu";
import { WatchToggle } from "@/components/people/watch-toggle";
import { deletePerson } from "@/lib/actions/person-actions";

export const dynamic = "force-dynamic";

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    ctype?: string;
    channel?: string;
    crating?: string;
    era?: string;
    archive?: string;
    clabel?: string;
    csort?: string;
  }>;
};

const VALID_CAREER_SORTS = new Set<CareerSort>([
  "date-desc",
  "date-asc",
  "rating-desc",
  "rating-asc",
]);

const VALID_ARCHIVE_BUCKETS = new Set<CareerArchiveStatusBucket>([
  "linked",
  "unlinked",
  "missing",
  "changed",
]);

export default async function PersonDetailPage({ params, searchParams }: PersonDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const sp = await searchParams;
    const initialTab = sp.tab;

    // Parse career-tab URL searchParams. Type defaults to "photo".
    const ctype = sp.ctype === "video" ? "video" : "photo";
    const channelIds = sp.channel ? sp.channel.split(",").filter(Boolean) : [];
    const ratingsRaw = sp.crating ? sp.crating.split(",").filter(Boolean) : [];
    const activeRatings = ratingsRaw
      .map((v) => (v === "unrated" ? ("unrated" as const) : parseInt(v, 10)))
      .filter((v): v is number | "unrated" =>
        v === "unrated" || (typeof v === "number" && !isNaN(v) && v >= 1 && v <= 5),
      );
    const eraIds = sp.era ? sp.era.split(",").filter(Boolean) : [];
    const labelIds = sp.clabel ? sp.clabel.split(",").filter(Boolean) : [];
    const archiveStatuses = sp.archive
      ? (sp.archive.split(",").filter(Boolean) as CareerArchiveStatusBucket[]).filter((v) =>
          VALID_ARCHIVE_BUCKETS.has(v),
        )
      : [];
    const careerSort: CareerSort =
      sp.csort && VALID_CAREER_SORTS.has(sp.csort as CareerSort)
        ? (sp.csort as CareerSort)
        : "date-desc";

    const careerFilters = {
      type: ctype as "photo" | "video",
      channelIds: channelIds.length > 0 ? channelIds : undefined,
      ratings: activeRatings.length > 0 ? activeRatings : undefined,
      eraIds: eraIds.length > 0 ? eraIds : undefined,
      archiveStatuses: archiveStatuses.length > 0 ? archiveStatuses : undefined,
      labelIds: labelIds.length > 0 ? labelIds : undefined,
      sort: careerSort,
    };

  // Ensure system entity categories exist before loading category data
  await ensureEntityCategories();

  const [person, workHistory, connections, profileLabels, refSession, headshots, categoryGroups, populatedCounts, skillGroups, skillLevelConfigs, aliasesWithChannels, sessionWorkHistory, productionSessions, entityMediaMap, physicalAttributeGroups, personEntityTags, digitalIdentities, researchEntries, stagingWorkHistory, eraContributionsMap, careerTimeline, careerStats, careerFacetCounts, careerChannels, careerEras] =
    await Promise.all([
      getPersonWithDetails(id),
      getPersonWorkHistory(id),
      getPersonConnections(id),
      getProfileImageLabels(),
      getPersonReferenceSession(id),
      getPersonHeadshots(id),
      getAllCategoryGroups(),
      getPopulatedCategoriesForPerson(id),
      getAllSkillGroups(),
      getSkillLevelConfigs(),
      getPersonAliases(id),
      getPersonSessionWorkHistory(id),
      getPersonProductionSessions(id),
      getPersonEntityMedia(id),
      getAllPhysicalAttributeGroups(),
      getEntityTags("PERSON", id),
      getPersonDigitalIdentities(id),
      getPersonResearch(id),
      getStagingWorkHistoryForPerson(id),
      getPersonEraContributions(id),
      getCareerTimeline(id, careerFilters),
      getCareerStats(id),
      getCareerFacetCounts(id, careerFilters),
      getCareerChannelsForPerson(id),
      getCareerErasForPerson(id),
    ]);

  // Flatten Map → Record for client-component serialization.
  const eraContributions = Object.fromEntries(eraContributionsMap);

  if (!person) notFound();

  const currentState = deriveCurrentState(person);
  const affiliations = deriveAffiliations(workHistory, stagingWorkHistory);

  const plausibilityIssues = computePlausibilityIssues({
    birthdate: person.birthdate,
    birthdatePrecision: person.birthdatePrecision,
    birthdateModifier: person.birthdateModifier,
    status: person.status,
    activeFrom: person.activeFrom,
    activeFromPrecision: person.activeFromPrecision,
    retiredAt: person.retiredAt,
    retiredAtPrecision: person.retiredAtPrecision,
    aliases: person.aliases,
    eras: person.eras.map((e) => ({
      id: e.id,
      isBaseline: e.isBaseline,
      date: e.date,
      datePrecision: e.datePrecision,
      scalarDeltas: e.scalarDeltas,
    })),
    contributions: sessionWorkHistory.map((s) => ({
      confidence: s.confidence,
      sessionDate: s.sessionDate,
      sessionDatePrecision: s.sessionDatePrecision,
      eraId: s.eraId,
    })),
  });

  // Compute Calculated PGRADE (CP) = max skill definition pgrade across active skills
  // pgrade 0 = excluded from CP calculation
  const calculatedPgrade = currentState.activeSkills.reduce((max, skill) => {
    const pg = skill.definitionPgrade;
    return pg !== null && pg > 0 && pg > max ? pg : max;
  }, 0) || null;

  // Compute Mean Weighted CP (WCP) = mean of (pgrade + delta) for active skills with pgrade > 0
  const deltaMap = new Map(skillLevelConfigs.map((c) => [c.enumKey, c.delta]));
  const wcpSkills = currentState.activeSkills
    .filter((s) => s.definitionPgrade !== null && s.definitionPgrade > 0)
    .map((s) => {
      const delta = s.level ? (deltaMap.get(s.level) ?? 0) : 0;
      return Math.min(s.definitionPgrade! + delta, 10);
    });
  const meanWcp =
    wcpSkills.length > 0
      ? wcpSkills.reduce((sum, v) => sum + v, 0) / wcpSkills.length
      : null;

  // Load MediaItems from reference session (authoritative source)
  const galleryItems = refSession
    ? await getPersonMediaGallery(id, refSession.id)
    : [];

  // Flatten categories for the Details tab
  const flatCategories = categoryGroups.flatMap((g) =>
    g.categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      groupId: g.id,
      groupName: g.name,
      entityModel: c.entityModel,
    })),
  );

  const categoryCounts = Array.from(populatedCounts.entries()).map(([categoryId, count]) => ({
    categoryId,
    count,
  }));

  // Serialize entity media map for client components
  const entityMedia: Record<string, EntityMediaThumbnail[]> = Object.fromEntries(entityMediaMap);

  // Build headshot slot entries for the gallery lightbox (serializable array)
  const headshotSlotEntries = headshots
    .filter((h) => h.slot !== null)
    .map((h) => ({
      mediaItemId: h.mediaItem.id,
      slot: h.slot as number,
      // Aspect-preserving thumbnail for the Standardized Slots expander (works
      // for normalized 2:3 images and raw headshots alike).
      thumbUrl: h.mediaItem.urls.gallery_512 ?? h.mediaItem.urls.view_1200 ?? h.mediaItem.urls.original ?? null,
    }));

  // Canonical headshot for the hero lead slide — same resolution as the People browser
  // (★ slot, else lowest slot; standardized images served aspect-preserving). The id is
  // the canonical link's media item, used to de-dupe it from the gallery carousel.
  const heroHeadshot = (await getHeadshotsForPersons([id])).get(id) ?? null;
  const leadLink = [...headshots].sort((a, b) =>
    a.isAvatar === b.isAvatar ? (a.slot ?? 99) - (b.slot ?? 99) : a.isAvatar ? -1 : 1,
  )[0];
  const heroLead =
    heroHeadshot && leadLink
      ? { id: leadLink.mediaItem.id, url: heroHeadshot.url, focalX: heroHeadshot.focalX, focalY: heroHeadshot.focalY }
      : null;

  return (
    <div className="space-y-6">
      {/* Back link + browse nav + actions row */}
      <div className="grid grid-cols-3 items-center gap-4">
        <div className="flex items-center">
          <BrowseBackLink />
        </div>
        <div className="flex justify-center">
          <Suspense fallback={null}>
            <BrowseNavBar personId={id} />
          </Suspense>
        </div>
        <div className="flex items-center justify-end gap-2">
          <WatchToggle personId={id} watching={person.watching} />
          <EditPersonSheet person={person} />
          <PersonActionsMenu personId={id} onDelete={deletePerson.bind(null, id)} redirectTo="/people" />
        </div>
      </div>

      <PersonDetailTabs
        person={person}
        initialTab={initialTab}
        currentState={currentState}
        workHistory={workHistory}
        affiliations={affiliations}
        connections={connections}
        photos={galleryItems}
        profileLabels={profileLabels}
        referenceSessionId={refSession?.id}
        refMediaCount={refSession?._count.mediaItems ?? 0}
        headshotSlotEntries={headshotSlotEntries}
        heroLead={heroLead}
        categories={flatCategories}
        categoryCounts={categoryCounts}
        skillGroups={skillGroups}
        physicalAttributeGroups={physicalAttributeGroups}
        calculatedPgrade={calculatedPgrade}
        meanWcp={meanWcp}
        aliasesWithChannels={aliasesWithChannels}
        sessionWorkHistory={sessionWorkHistory}
        productionSessions={productionSessions}
        entityMedia={entityMedia}
        plausibilityIssues={plausibilityIssues}
        digitalIdentities={digitalIdentities}
        researchEntries={researchEntries}
        stagingWorkHistory={stagingWorkHistory}
        careerTimeline={careerTimeline}
        careerStats={careerStats}
        careerFacetCounts={careerFacetCounts}
        careerChannels={careerChannels}
        careerEras={careerEras}
        careerActiveType={ctype as "photo" | "video"}
        careerActiveChannelIds={channelIds}
        careerActiveRatings={activeRatings}
        careerActiveEraIds={eraIds}
        careerActiveArchiveStatuses={archiveStatuses}
        careerActiveLabelIds={labelIds}
        careerActiveSort={careerSort}
        eraContributions={eraContributions}
        entityTags={personEntityTags.map((t) => ({
          id: t.id,
          name: t.name,
          group: t.group,
        }))}
      />
    </div>
    );
  });
}
