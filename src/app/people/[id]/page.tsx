import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Camera, ArrowRight, ImageIcon } from "lucide-react";
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
import { getPersonHeadshots, getFilledHeadshotSlots, getPersonMediaGallery } from "@/lib/services/media-service";
import { getAllCategoryGroups, getPopulatedCategoriesForPerson } from "@/lib/services/category-service";
import { getAllSkillGroups } from "@/lib/services/skill-catalog-service";
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

  const [person, workHistory, connections, profileLabels, refSession, headshots, filledSlots, categoryGroups, populatedCounts, skillGroups, skillLevelConfigs, aliasesWithChannels, sessionWorkHistory, productionSessions] =
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

      {/* Reference Media card */}
      {refSession && (
        <Link
          href={`/sessions/${refSession.id}`}
          className="group block rounded-2xl border border-white/20 bg-card/70 px-5 py-4 shadow-md backdrop-blur-sm transition-all hover:border-white/30 hover:bg-card/80 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Camera size={16} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold group-hover:text-primary transition-colors">
                Reference Media
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {refSession._count.mediaItems} {refSession._count.mediaItems === 1 ? "item" : "items"}
              </span>
            </div>
            <ArrowRight size={14} className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>

          {/* Headshot slot strip */}
          {profileLabels.length > 0 && (
            <div className="mt-3 flex gap-2">
              {profileLabels.map((sl, i) => {
                const slotNumber = i + 1;
                const hs = headshots.find((h) => h.slot === slotNumber);
                const thumbUrl = hs?.mediaItem.urls.profile_128 ?? hs?.mediaItem.urls.profile_256 ?? null;

                return (
                  <div
                    key={sl.slot}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/15 bg-muted/40">
                      {thumbUrl ? (
                        <Image
                          src={thumbUrl}
                          alt={sl.label}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon size={14} className="text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[48px]">
                      {sl.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
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
        calculatedPgrade={calculatedPgrade}
        meanWcp={meanWcp}
        aliasesWithChannels={aliasesWithChannels}
        sessionWorkHistory={sessionWorkHistory}
        productionSessions={productionSessions}
      />
    </div>
  );
}
