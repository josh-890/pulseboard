import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, FolderKanban, Users, ImageIcon, Clapperboard, Camera, Film, User } from "lucide-react";
import { getSessionById } from "@/lib/services/session-service";
import { getLabels } from "@/lib/services/label-service";
import { getProjects } from "@/lib/services/project-service";
import { getMediaItemsForSession } from "@/lib/services/media-service";
import { cn, formatPartialDate } from "@/lib/utils";
import { SessionStatusBadge } from "@/components/sessions/session-status-badge";
import { EditSessionSheet } from "@/components/sessions/edit-session-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteSession } from "@/lib/actions/session-actions";
import {
  SessionInlineTitle,
  SessionInlineDescription,
  SessionInlineNotes,
  SessionInlineLocation,
} from "@/components/sessions/session-detail-header";
import { SessionMergeDialog } from "@/components/sessions/session-merge-dialog";
import { SessionMediaGallery } from "@/components/sessions/session-media-gallery";

export const dynamic = "force-dynamic";

type SessionDetailPageProps = {
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

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm italic text-muted-foreground/70">{message}</p>;
}

// ── Main page ───────────────────────────────────────────────────────────────

export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = await params;

  const [session, labels, projects, mediaItems] = await Promise.all([
    getSessionById(id),
    getLabels(),
    getProjects(),
    getMediaItemsForSession(id),
  ]);

  if (!session) notFound();

  const isReference = session.status === "REFERENCE";
  const labelOptions = labels.map(({ id, name }) => ({ id, name }));
  const projectOptions = projects.map(({ id, name }) => ({ id, name }));
  const participantCount = session.participants.length;
  const mediaCount = session._count.mediaItems;
  const setCount = session.setSessionLinks.length;

  return (
    <div className="space-y-6">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">&larr;</span>
          Back to Sessions
        </Link>
        {!isReference && (
          <div className="flex items-center gap-2">
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
              }}
              labels={labelOptions}
              projects={projectOptions}
            />
            <SessionMergeDialog
              survivingSessionId={id}
              survivingSessionName={session.name}
            />
            <DeleteButton
              title="Delete session?"
              description="This will remove the session, its participants, media items, and set links. This action cannot be undone."
              onDelete={deleteSession.bind(null, id)}
              redirectTo="/sessions"
            />
          </div>
        )}
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                {isReference ? (
                  <User size={18} className="text-primary" />
                ) : (
                  <Clapperboard size={18} className="text-primary" />
                )}
              </div>
              <SessionStatusBadge status={session.status} />
              {session.date && (
                <span className="text-sm text-muted-foreground">
                  {formatPartialDate(session.date, session.datePrecision)}
                </span>
              )}
            </div>
            <SessionInlineTitle sessionId={id} title={session.name} />

            {/* Label + Project + Person links */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {session.person && (
                <Link
                  href={`/people/${session.person.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary"
                >
                  <User size={12} />
                  {session.person.aliases[0]?.name ?? session.person.icgId}
                </Link>
              )}
              {session.label && (
                <Link
                  href={`/labels/${session.label.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary"
                >
                  <Building2 size={12} />
                  {session.label.name}
                </Link>
              )}
              {session.project && (
                <Link
                  href={`/projects/${session.project.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-muted/80 hover:text-primary"
                >
                  <FolderKanban size={12} />
                  {session.project.name}
                </Link>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex shrink-0 gap-4 text-center">
            {!isReference && (
              <div>
                <p className="text-2xl font-bold">{participantCount}</p>
                <p className="text-xs text-muted-foreground">
                  {participantCount === 1 ? "Participant" : "Participants"}
                </p>
              </div>
            )}
            <div>
              <p className="text-2xl font-bold">{mediaCount}</p>
              <p className="text-xs text-muted-foreground">
                {mediaCount === 1 ? "Media" : "Media"}
              </p>
            </div>
            {!isReference && (
              <div>
                <p className="text-2xl font-bold">{setCount}</p>
                <p className="text-xs text-muted-foreground">
                  {setCount === 1 ? "Set" : "Sets"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description, Notes, Location (inline editable) */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-3">
        {!isReference && (
          <SessionInlineLocation sessionId={id} location={session.location} />
        )}
        <SessionInlineDescription sessionId={id} description={session.description} />
        <SessionInlineNotes sessionId={id} notes={session.notes} />
      </div>

      {/* Media */}
      <SectionCard
        title={`Media (${mediaItems.length})`}
        icon={<ImageIcon size={18} />}
      >
        <SessionMediaGallery
          items={mediaItems.map(({ createdAt, ...rest }) => ({
            ...rest,
            createdAt: createdAt.toISOString() as unknown as Date,
          }))}
        />
      </SectionCard>

      {/* Participants */}
      {!isReference && (
        <SectionCard
          title={`Participants (${participantCount})`}
          icon={<Users size={18} />}
        >
          {session.participants.length === 0 ? (
            <EmptyState message="No participants in this session." />
          ) : (
            <ul className="space-y-1.5">
              {session.participants.map((participant) => {
                const commonAlias = participant.person.aliases[0]?.name;
                const displayName = commonAlias ?? participant.person.icgId;
                return (
                  <li key={`${participant.sessionId}-${participant.personId}-${participant.role}`}>
                    <Link
                      href={`/people/${participant.personId}`}
                      className="group flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium shrink-0 text-muted-foreground">
                        {participant.role}
                      </span>
                      <span className="text-sm font-medium text-foreground/90 group-hover:text-primary transition-colors">
                        {displayName}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {/* Linked Sets */}
      {!isReference && (
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
                  ? <Camera size={14} className="text-primary" />
                  : <Film size={14} className="text-primary" />;

                return (
                  <Link
                    key={link.set.id}
                    href={`/sets/${link.set.id}`}
                    className="group flex items-center justify-between rounded-xl border border-white/15 bg-card/40 px-4 py-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        {setTypeIcon}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium group-hover:text-primary transition-colors">
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
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Primary
                        </span>
                      )}
                      {link.set.releaseDate && (
                        <span className="text-xs text-muted-foreground">
                          {formatPartialDate(link.set.releaseDate, link.set.releaseDatePrecision)}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
