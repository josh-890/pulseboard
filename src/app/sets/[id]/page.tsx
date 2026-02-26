import { notFound } from "next/navigation";
import Link from "next/link";
import { Camera, Film, Tag, FileText } from "lucide-react";
import { getSetById, getChannelsForSelect } from "@/lib/services/set-service";
import { getPhotosForEntity } from "@/lib/services/photo-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import { SetDetailGallery } from "@/components/sets/set-detail-gallery";
import { CreditResolutionPanel } from "@/components/sets/credit-resolution-panel";
import { cn, formatPartialDate } from "@/lib/utils";
import type { SetType, PhotoWithUrls } from "@/lib/types";
import { EditSetSheet } from "@/components/sets/edit-set-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteSet } from "@/lib/actions/set-actions";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type SetDetailPageProps = {
  params: Promise<{ id: string }>;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

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

  const [set, photos, channels, profileLabels] = await Promise.all([
    getSetById(id),
    getPhotosForEntity("set", id),
    getChannelsForSelect(),
    getProfileImageLabels(),
  ]);

  if (!set) notFound();

  const typeConfig = SET_TYPE_CONFIG[set.type];

  // Strip variants from photos before passing to client component (RSC payload safety)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const photoProps = photos.map(({ variants, ...rest }) => rest);

  // Determine if we have credits
  const hasCredits = set.creditsRaw.length > 0;

  // Get the primary label from channel's label maps
  const primaryLabel = set.channel?.labelMaps[0]?.label;

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
              channelId: set.channelId,
              description: set.description,
              notes: set.notes,
              releaseDate: set.releaseDate,
              releaseDatePrecision: set.releaseDatePrecision,
              category: set.category,
              genre: set.genre,
              tags: set.tags,
            }}
            channels={channels}
          />
          <DeleteButton
            title="Delete set?"
            description="This will permanently remove the set and all credits. This action cannot be undone."
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
                  {formatPartialDate(set.releaseDate, set.releaseDatePrecision)}
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
                {primaryLabel && (
                  <>
                    {" · "}
                    <Link
                      href={`/labels/${primaryLabel.id}`}
                      className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
                    >
                      {primaryLabel.name}
                    </Link>
                  </>
                )}
              </p>
            )}

            {/* Label evidence badges */}
            {set.labelEvidence.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {set.labelEvidence.map((ev) => (
                  <Badge
                    key={`${ev.setId}-${ev.labelId}-${ev.evidenceType}`}
                    variant="outline"
                    className={cn(
                      "text-xs",
                      ev.evidenceType === "CHANNEL_MAP"
                        ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        : "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400",
                    )}
                  >
                    {ev.label.name}
                    <span className="ml-1 opacity-60">
                      {ev.evidenceType === "CHANNEL_MAP" ? "channel" : "manual"}
                    </span>
                  </Badge>
                ))}
              </div>
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

      {/* Credits & Participants */}
      {hasCredits && (
        <SectionCard
          title={`Credits (${set.creditsRaw.length})`}
          icon={<FileText size={18} />}
        >
          <CreditResolutionPanel
            credits={set.creditsRaw.map((c) => ({
              id: c.id,
              role: c.role,
              rawName: c.rawName,
              resolutionStatus: c.resolutionStatus,
              resolvedPerson: c.resolvedPerson
                ? {
                    id: c.resolvedPerson.id,
                    icgId: c.resolvedPerson.icgId,
                    aliases: c.resolvedPerson.aliases.map((a) => ({
                      name: a.name,
                      type: a.type,
                    })),
                  }
                : null,
            }))}
          />
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
