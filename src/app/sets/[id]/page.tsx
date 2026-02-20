import { notFound } from "next/navigation";
import Link from "next/link";
import { Camera, Film, Tag, Users } from "lucide-react";
import { getSetById, getSessionsForSelect, getChannelsForSelect } from "@/lib/services/set-service";
import { getPhotosForEntity } from "@/lib/services/photo-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import { SetDetailGallery } from "@/components/sets/set-detail-gallery";
import { cn } from "@/lib/utils";
import type { ContributionRole, SetType, PhotoWithUrls } from "@/lib/types";
import { EditSetSheet } from "@/components/sets/edit-set-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteSet } from "@/lib/actions/set-actions";

export const dynamic = "force-dynamic";

type SetDetailPageProps = {
  params: Promise<{ id: string }>;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatReleaseDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getInitialsForPerson(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

type SetTypeConfig = {
  icon: React.ReactNode;
  label: string;
  className: string;
};

const SET_TYPE_CONFIG: Record<SetType, SetTypeConfig> = {
  photo: {
    icon: <Camera size={12} />,
    label: "Photo",
    className:
      "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  video: {
    icon: <Film size={12} />,
    label: "Video",
    className:
      "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
};

const ROLE_STYLES: Record<ContributionRole, string> = {
  main: "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  supporting:
    "border-purple-500/30 bg-purple-500/15 text-purple-600 dark:text-purple-400",
  background:
    "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const ROLE_LABELS: Record<ContributionRole, string> = {
  main: "Main",
  supporting: "Supporting",
  background: "Background",
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
  const { id } = await params;

  const [set, photos, sessions, channels, profileLabels] = await Promise.all([
    getSetById(id),
    getPhotosForEntity("set", id),
    getSessionsForSelect(),
    getChannelsForSelect(),
    getProfileImageLabels(),
  ]);

  if (!set) notFound();

  const typeConfig = SET_TYPE_CONFIG[set.type];

  // Strip variants from photos before passing to client component (RSC payload safety)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const photoProps = photos.map(({ variants, ...rest }) => rest);

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
              id: set.id,
              type: set.type,
              title: set.title,
              sessionId: set.sessionId,
              channelId: set.channelId,
              description: set.description,
              notes: set.notes,
              releaseDate: set.releaseDate,
              category: set.category,
              genre: set.genre,
              tags: set.tags,
            }}
            sessions={sessions}
            channels={channels}
          />
          <DeleteButton
            title="Delete set?"
            description="This will permanently remove the set and all contributions. This action cannot be undone."
            onDelete={deleteSet.bind(null, id)}
            redirectTo="/sets"
          />
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  typeConfig.className,
                )}
              >
                {typeConfig.icon}
                {typeConfig.label}
              </span>
              {set.releaseDate && (
                <span className="text-sm text-muted-foreground">
                  {formatReleaseDate(set.releaseDate)}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold leading-tight">{set.title}</h1>

            {/* Channel / label */}
            {set.channel && (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {set.channel.name}
                </span>
                {" · "}
                <Link
                  href={`/labels/${set.channel.label.id}`}
                  className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
                >
                  {set.channel.label.name}
                </Link>
              </p>
            )}

            {/* Session / project */}
            {set.session && (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-muted-foreground/70">Session: </span>
                <span className="font-medium text-foreground/80">
                  {set.session.name}
                </span>
                {" · "}
                <Link
                  href={`/projects/${set.session.project.id}`}
                  className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
                >
                  {set.session.project.name}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Description + notes */}
      {(set.description || set.notes) && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-3">
          {set.description && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {set.description}
              </p>
            </div>
          )}
          {set.notes && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {set.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Photo gallery */}
      <SetDetailGallery
        photos={photoProps as PhotoWithUrls[]}
        entityId={id}
        profileLabels={profileLabels}
      />

      {/* Cast section */}
      {set.contributions.length > 0 && (
        <SectionCard
          title={`Cast (${set.contributions.length})`}
          icon={<Users size={18} />}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {set.contributions.map((contribution) => {
              const common = contribution.person.aliases.find(
                (a) => a.type === "common",
              );
              const displayName = common?.name ?? contribution.person.icgId;
              const initials = getInitialsForPerson(displayName);
              return (
                <Link
                  key={contribution.id}
                  href={`/people/${contribution.person.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-primary">
                      {displayName}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                        ROLE_STYLES[contribution.role],
                      )}
                    >
                      {ROLE_LABELS[contribution.role]}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Tags */}
      {set.tags.length > 0 && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <Tag size={16} className="text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {set.tags.map((tag) => (
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
}
