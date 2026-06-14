import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Users, ImageIcon, Camera, Film, User, Sparkles } from "lucide-react";
import { SessionBrowseNavBar, SessionBrowseBackLink } from "@/components/sessions/session-browse-nav-bar";
import { getSessionById } from "@/lib/services/session-service";
import { getLabels } from "@/lib/services/label-service";
import { getProjects } from "@/lib/services/project-service";
import { getSessionMediaGallery, getMediaItemsWithLinks, getCoverPhotosForSessions, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getHeroBackdropEnabled } from "@/lib/services/setting-service";
import { getPersonProfileFramings } from "@/lib/services/profile-service";
import { getCollectionsForPerson } from "@/lib/services/collection-service";
import { getAllCategoryGroups } from "@/lib/services/category-service";
import { getSessionContributions, getContributionSkillMediaMap, getContributorsWithEntities } from "@/lib/services/contribution-service";
import { getAllSkillGroups } from "@/lib/services/skill-catalog-service";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";
import { getEntityTags } from "@/lib/services/entity-tag-service";
import { prisma } from "@/lib/db";
import { cn, formatPartialDateISO } from "@/lib/utils";
import { EditSessionSheet } from "@/components/sessions/edit-session-sheet";
import { deleteSession } from "@/lib/actions/session-actions";
import { SessionActionsMenu } from "@/components/sessions/session-actions-menu";
import { ContributionParticipantRow } from "@/components/sessions/contribution-participant-row";
import { SessionHero } from "@/components/sessions/session-hero";
import { SessionTagSection } from "@/components/sessions/session-tag-section";
import { SessionProductionGallery, SessionUploadButton } from "@/components/sessions/session-production-gallery";
import type { ProductionContext } from "@/components/gallery/gallery-lightbox";
import { SessionContributionSkills } from "@/components/sessions/session-contribution-skills";
import { ReferenceSessionPage } from "@/components/sessions/reference-session-page";
import { AddContributorSheet } from "@/components/sessions/add-contributor-sheet";
import { SessionAboutCard } from "@/components/sessions/session-about-card";

export const dynamic = "force-dynamic";

type SessionDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

// ── Sub-components ──────────────────────────────────────────────────────────

type SectionCardProps = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
};

function SectionCard({ title, icon, children, className, action }: SectionCardProps) {
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
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm italic text-muted-foreground/70">{message}</p>;
}

// ── Main page ───────────────────────────────────────────────────────────────

export default async function SessionDetailPage({ params, searchParams }: SessionDetailPageProps) {
  return withTenantFromHeaders(async () => {
    const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const [session, labels, projects, backdropEnabled] = await Promise.all([
    getSessionById(id),
    getLabels(),
    getProjects(),
    getHeroBackdropEnabled(),
  ]);

  if (!session) notFound();

  const sessionEntityTags = await getEntityTags("SESSION", id);
  const sessionTags = sessionEntityTags.map((t) => ({
    id: t.id,
    name: t.name,
    group: t.group,
  }));

  const isReference = session.type === "REFERENCE";
  const labelOptions = labels.map(({ id, name }) => ({ id, name }));
  const projectOptions = projects.map(({ id, name }) => ({ id, name }));
  const contributionCount = session.contributions.length;
  const mediaCount = session._count.mediaItems;
  const setCount = session.setSessionLinks.length;

  // Hero data: cover photo + contributor headshots (production sessions only)
  const [coverPhotoMap, headshotMap] = !isReference
    ? await Promise.all([
        getCoverPhotosForSessions([id]),
        getHeadshotsForPersons(session.contributions.map((c) => c.personId)),
      ])
    : [new Map<string, import("@/lib/services/media-service").CoverPhotoData>(), new Map<string, import("@/lib/services/media-service").HeadshotData>()];
  const coverPhoto = coverPhotoMap.get(id) ?? null;

  // Load data for reference sessions (MediaManager) vs regular sessions (SessionMediaGallery)
  let mediaItems: Awaited<ReturnType<typeof getSessionMediaGallery>> = [];
  let mediaManagerData: {
    items: Awaited<ReturnType<typeof getMediaItemsWithLinks>>;
    collections: Awaited<ReturnType<typeof getCollectionsForPerson>>;
    categories: { id: string; name: string; slug: string; groupId: string; groupName: string; entityModel: string | null }[];
    bodyMarks: { id: string; name: string }[];
    bodyModifications: { id: string; name: string }[];
    cosmeticProcedures: { id: string; name: string }[];
    eras: { id: string; label: string; date: string | null }[];
    skillEvents: { id: string; skillName: string; eventType: string; date: string | null }[];
    profileFramings: Awaited<ReturnType<typeof getPersonProfileFramings>>;
  } | null = null;

  if (isReference && session.personId) {
    const personId = session.personId;
    const [itemsWithLinks, collections, categoryGroups, bodyMarks, bodyMods, cosmetics, eras, skillEventsRaw] =
      await Promise.all([
        getMediaItemsWithLinks(id, personId),
        getCollectionsForPerson(personId),
        getAllCategoryGroups(),
        prisma.bodyMark.findMany({
          where: { personId, status: "present" },
          select: { id: true, type: true, bodyRegion: true },
          orderBy: { bodyRegion: "asc" },
        }),
        prisma.bodyModification.findMany({
          where: { personId, status: "present" },
          select: { id: true, type: true, bodyRegion: true },
          orderBy: { bodyRegion: "asc" },
        }),
        prisma.cosmeticProcedure.findMany({
          where: { personId },
          select: { id: true, type: true, bodyRegion: true },
          orderBy: { bodyRegion: "asc" },
        }),
        prisma.era.findMany({
          where: { personId },
          select: { id: true, label: true, date: true },
          orderBy: { date: "asc" },
        }),
        prisma.personSkillEvent.findMany({
          where: { personSkill: { personId }, eventType: "DEMONSTRATED" },
          select: {
            id: true,
            eventType: true,
            date: true,
            personSkill: {
              select: { skillDefinition: { select: { name: true } } },
            },
          },
          orderBy: { date: "desc" },
        }),
      ]);
    const profileFramings = await getPersonProfileFramings(personId);
    mediaManagerData = {
      items: itemsWithLinks,
      profileFramings,
      collections,
      categories: categoryGroups.flatMap((g) =>
        g.categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          groupId: g.id,
          groupName: g.name,
          entityModel: c.entityModel,
        })),
      ),
      bodyMarks: bodyMarks.map((m) => ({ id: m.id, name: `${m.type} — ${m.bodyRegion}` })),
      bodyModifications: bodyMods.map((m) => ({ id: m.id, name: `${m.type} — ${m.bodyRegion}` })),
      cosmeticProcedures: cosmetics.map((m) => ({ id: m.id, name: `${m.type} — ${m.bodyRegion}` })),
      eras: eras.map((p) => ({
        id: p.id,
        label: p.label,
        date: p.date ? p.date.toISOString().split("T")[0] : null,
      })),
      skillEvents: skillEventsRaw
        .filter((e) => e.personSkill.skillDefinition != null)
        .map((e) => ({
          id: e.id,
          skillName: e.personSkill.skillDefinition!.name,
          eventType: e.eventType,
          date: e.date ? e.date.toISOString().split("T")[0] : null,
        })),
    };
  } else {
    mediaItems = await getSessionMediaGallery(id);
  }

  // Reference sessions → dedicated page component
  if (isReference && mediaManagerData && session.personId) {
    const personName = session.person?.aliases[0]?.name ?? session.person?.icgId ?? session.name;
    // Use the canonical avatar resolution (★ HEADSHOT slot, else lowest slot;
    // standardized served aspect-preserving) — same as the People card / person hero —
    // so the back-link thumb tracks the avatar.
    const personHeadshot = (await getHeadshotsForPersons([session.personId])).get(session.personId) ?? null;
    const personThumbUrl = personHeadshot?.url ?? null;

    return (
      <ReferenceSessionPage
        personId={session.personId}
        personName={personName}
        personThumbUrl={personThumbUrl}
        personThumbFocalX={personHeadshot?.focalX ?? null}
        personThumbFocalY={personHeadshot?.focalY ?? null}
        sessionId={id}
        mediaCount={mediaCount}
        items={mediaManagerData.items.map(({ createdAt, ...rest }) => ({
          ...rest,
          createdAt: createdAt.toISOString() as unknown as Date,
        }))}
        profileFramings={mediaManagerData.profileFramings}
        collections={mediaManagerData.collections}
        categories={mediaManagerData.categories}
        bodyMarks={mediaManagerData.bodyMarks}
        bodyModifications={mediaManagerData.bodyModifications}
        cosmeticProcedures={mediaManagerData.cosmeticProcedures}
        eras={mediaManagerData.eras}
        skillEvents={mediaManagerData.skillEvents}
        initialTab={resolvedSearchParams.tab}
      />
    );
  }

  // Load contributions + skill groups + skill media + entity data + role groups for production sessions
  const [sessionContributions, skillGroups, contributionSkillMedia, contributorsWithEntities, prodCategoryGroups, contributionRoleGroups] = !isReference
    ? await Promise.all([getSessionContributions(id), getAllSkillGroups(), getContributionSkillMediaMap(id), getContributorsWithEntities(id), getAllCategoryGroups(), getAllContributionRoleGroups()])
    : [[], [], new Map<string, { id: string; thumbUrl: string }[]>(), [], [], []];

  const roleDefinitions = (contributionRoleGroups as Awaited<ReturnType<typeof getAllContributionRoleGroups>>).flatMap((g) =>
    g.definitions.map((d) => ({ id: d.id, name: d.name, groupName: g.name })),
  );

  const productionContext: ProductionContext | undefined =
    !isReference && contributorsWithEntities.length > 0
      ? {
          sessionId: id,
          contributors: contributorsWithEntities,
          categories: prodCategoryGroups.flatMap((g) =>
            g.categories.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              groupId: g.id,
              groupName: g.name,
              entityModel: c.entityModel,
            })),
          ),
        }
      : undefined;

  const skillCount = sessionContributions.reduce((acc, c) => acc + c.skills.length, 0);

  return (
    <div className="space-y-6">
      {/* Back link + browse nav + actions row */}
      <div className="grid grid-cols-3 items-center gap-4">
        <div className="flex items-center">
          <SessionBrowseBackLink />
        </div>
        <div className="flex justify-center">
          <Suspense fallback={null}>
            <SessionBrowseNavBar sessionId={id} />
          </Suspense>
        </div>
        {!isReference && (
          <div className="flex items-center justify-end gap-2">
            <EditSessionSheet
              session={{
                id: session.id,
                name: session.name,
                projectId: session.projectId,
                labelId: session.labelId,
                description: session.description,
                location: session.location,
                status: session.status,
                notes: session.notes,
                date: session.date,
                datePrecision: session.datePrecision,
                dateIsConfirmed: session.dateIsConfirmed,
              }}
              labels={labelOptions}
              projects={projectOptions}
            />
            <SessionActionsMenu
              sessionId={id}
              sessionName={session.name}
              onDelete={deleteSession.bind(null, id)}
              redirectTo="/sessions"
            />
          </div>
        )}
      </div>

      {/* Hero card */}
      {!isReference && (
        <SessionHero
          session={session}
          coverPhoto={coverPhoto}
          headshotMap={headshotMap}
          backdropEnabled={backdropEnabled}
        />
      )}
      {isReference && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-entity-session/15">
              <User size={18} className="text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold leading-tight">{session.name}</h1>
        </div>
      )}

      {/* About card: location + description + notes (hidden when all empty) */}
      {!isReference && (
        <SessionAboutCard
          sessionId={id}
          location={session.location}
          description={session.description}
          notes={session.notes}
        />
      )}

      {/* 2-column layout for production sessions */}
      {!isReference && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px] items-start">
          {/* Left column: gallery + contribution skills */}
          <div className="space-y-6">
            <SectionCard
              title={`Media (${mediaCount})`}
              icon={<ImageIcon size={18} />}
              action={<SessionUploadButton />}
            >
              <SessionProductionGallery
                items={mediaItems.map((item) => ({
                  ...item,
                  createdAt: item.createdAt.toISOString() as unknown as Date,
                }))}
                sessionId={id}
                coverMediaItemId={session.coverMediaItemId ?? null}
                productionContext={productionContext}
              />
            </SectionCard>

            <SectionCard
              title={`Contribution Skills (${skillCount})`}
              icon={<Sparkles size={18} />}
            >
              <SessionContributionSkills
                sessionId={id}
                contributions={sessionContributions}
                skillGroups={skillGroups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  definitions: g.definitions.map((d) => ({
                    id: d.id,
                    name: d.name,
                    slug: d.slug,
                    description: d.description,
                    pgrade: d.pgrade,
                    defaultLevel: d.defaultLevel,
                  })),
                }))}
                skillMedia={Object.fromEntries(contributionSkillMedia)}
              />
            </SectionCard>
          </div>

          {/* Right sidebar: contributors + linked sets + tags */}
          <div className="space-y-6">
            <SectionCard
              title={`Contributors (${contributionCount})`}
              icon={<Users size={18} />}
              action={<AddContributorSheet sessionId={id} sessionDate={session.date} roleDefinitions={roleDefinitions} />}
            >
              {session.contributions.length === 0 ? (
                <EmptyState message="No contributors in this session." />
              ) : (
                <ul className="space-y-0.5">
                  {session.contributions.map((contribution) => (
                    <ContributionParticipantRow
                      key={contribution.id}
                      contributionId={contribution.id}
                      sessionId={id}
                      roleName={contribution.roleDefinition.name}
                      creditNameOverride={contribution.creditNameOverride}
                      era={contribution.era}
                      person={contribution.person}
                      sessionDate={session.date}
                    />
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title={`Linked Sets (${setCount})`}
              icon={<ImageIcon size={18} />}
            >
              {session.setSessionLinks.length === 0 ? (
                <EmptyState message="No sets linked to this session." />
              ) : (
                <div className="space-y-2">
                  {session.setSessionLinks.map((link) => {
                    const setTypeIcon = link.set.type === "photo"
                      ? <Camera size={14} className="text-entity-set" />
                      : <Film size={14} className="text-entity-set" />;

                    return (
                      <Link
                        key={link.set.id}
                        href={`/sets/${link.set.id}`}
                        className="group flex items-center justify-between rounded-xl border border-white/15 bg-card/40 px-4 py-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-entity-set/10">
                            {setTypeIcon}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium group-hover:text-entity-set transition-colors">
                              {link.set.title}
                            </span>
                            {link.set.channel && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {link.set.channel.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="ml-3 flex shrink-0 items-center gap-2">
                          {link.isPrimary && (
                            <span className="rounded-full border border-entity-set/20 bg-entity-set/10 px-2 py-0.5 text-xs font-medium text-entity-set">
                              Primary
                            </span>
                          )}
                          {link.set.releaseDate && (
                            <span className="text-xs text-muted-foreground">
                              {formatPartialDateISO(link.set.releaseDate, link.set.releaseDatePrecision)}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SessionTagSection sessionId={id} initialTags={sessionTags} />
          </div>
        </div>
      )}
    </div>
    );
  });
}
