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
import { getPersonHeadshots, getFilledHeadshotSlots, getPersonMediaGallery, getPersonEntityMedia } from "@/lib/services/media-service";
import type { EntityMediaThumbnail } from "@/lib/services/media-service";
import { getAllCategoryGroups, getPopulatedCategoriesForPerson, ensureEntityCategories } from "@/lib/services/category-service";
import { getAllSkillGroups } from "@/lib/services/skill-catalog-service";
import { getAllPhysicalAttributeGroups } from "@/lib/services/physical-attribute-catalog-service";
import { getPersonAliases } from "@/lib/services/alias-service";
import { getEntityTags } from "@/lib/services/entity-tag-service";
import { PersonDetailTabs } from "@/components/people/person-detail-tabs";
import { computePlausibilityIssues } from "@/lib/services/plausibility-service";
import { EditPersonSheet } from "@/components/people/edit-person-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deletePerson } from "@/lib/actions/person-actions";

export const dynamic = "force-dynamic";

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function PersonDetailPage({ params, searchParams }: PersonDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params;
    const { tab: initialTab } = await searchParams;

  // Ensure system entity categories exist before loading category data
  await ensureEntityCategories();

  const [person, workHistory, connections, profileLabels, refSession, headshots, filledSlots, categoryGroups, populatedCounts, skillGroups, skillLevelConfigs, aliasesWithChannels, sessionWorkHistory, productionSessions, entityMediaMap, physicalAttributeGroups, personEntityTags] =
    await Promise.all([
      getPersonWithDetails(id),
      getPersonWorkHistory(id),
      getPersonConnections(id),
      getProfileImageLabels(),
      getPersonReferenceSession(id),
      getPersonHeadshots(id),
      getFilledHeadshotSlots(id),
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
    ]);

  if (!person) notFound();

  const currentState = deriveCurrentState(person);
  const affiliations = deriveAffiliations(workHistory);

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
    personas: person.personas,
    contributions: sessionWorkHistory.map((s) => ({
      confidence: s.confidence,
      sessionDate: s.sessionDate,
      sessionDatePrecision: s.sessionDatePrecision,
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
    .map((h) => ({ mediaItemId: h.mediaItem.id, slot: h.slot as number }));

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
          <EditPersonSheet person={person} />
          <DeleteButton
            title="Delete person?"
            description="This will permanently remove the person and all their data. This action cannot be undone."
            onDelete={deletePerson.bind(null, id)}
            redirectTo="/people"
          />
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
        filledHeadshotSlots={filledSlots}
        headshotSlotEntries={headshotSlotEntries}
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
