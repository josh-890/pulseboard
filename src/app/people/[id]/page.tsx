import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Camera, ArrowRight } from "lucide-react";
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
import { PersonDetailTabs } from "@/components/people/person-detail-tabs";
import { EditPersonSheet } from "@/components/people/edit-person-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deletePerson } from "@/lib/actions/person-actions";

export const dynamic = "force-dynamic";

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { id } = await params;

  // Ensure system entity categories exist before loading category data
  await ensureEntityCategories();

  const [person, workHistory, connections, profileLabels, refSession, headshots, filledSlots, categoryGroups, populatedCounts, skillGroups, skillLevelConfigs, aliasesWithChannels, sessionWorkHistory, productionSessions, entityMediaMap, physicalAttributeGroups] =
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
    ]);

  if (!person) notFound();

  const currentState = deriveCurrentState(person);
  const affiliations = deriveAffiliations(workHistory);

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
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/people"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">←</span>
          Back to People
        </Link>
        <div className="flex items-center gap-2">
          <EditPersonSheet person={person} />
          <DeleteButton
            title="Delete person?"
            description="This will permanently remove the person and all their data. This action cannot be undone."
            onDelete={deletePerson.bind(null, id)}
            redirectTo="/people"
          />
        </div>
      </div>

      {/* Compact Reference Media strip */}
      {refSession && (
        <Link
          href={`/sessions/${refSession.id}`}
          className="group flex items-center gap-3 rounded-xl border border-white/15 bg-card/50 px-4 py-2.5 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Camera size={14} className="shrink-0 text-primary" />
          <span className="text-sm font-medium group-hover:text-primary transition-colors">
            Reference Media
          </span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {refSession._count.mediaItems}
          </span>

          {/* Mini thumbnail strip */}
          {headshots.length > 0 && (
            <div className="flex gap-1 ml-1">
              {headshots.slice(0, 6).map((hs) => {
                const thumbUrl = hs.mediaItem.urls.profile_128 ?? hs.mediaItem.urls.profile_256;
                return thumbUrl ? (
                  <div key={hs.mediaItem.id} className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-white/10">
                    <Image
                      src={thumbUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : null;
              })}
            </div>
          )}

          <ArrowRight size={14} className="ml-auto shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        </Link>
      )}

      <PersonDetailTabs
        person={person}
        currentState={currentState}
        workHistory={workHistory}
        affiliations={affiliations}
        connections={connections}
        photos={galleryItems}
        profileLabels={profileLabels}
        referenceSessionId={refSession?.id}
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
      />
    </div>
  );
}
