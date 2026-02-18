import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Star,
  StarOff,
  MapPin,
  Users,
  Film,
  Camera,
  Tag,
  Building2,
  Network,
  BookUser,
  Fingerprint,
} from "lucide-react";
import {
  getPersonWithDetails,
  getPersonWorkHistory,
  getPersonAffiliations,
  getPersonConnections,
} from "@/lib/services/person-service";
import { getPhotosForEntity } from "@/lib/services/photo-service";
import type {
  PersonStatus,
  ContributionRole,
  SetType,
  RelationshipSource,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
} from "@/lib/types";
import { ImageGallery } from "@/components/photos/image-gallery";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

const STATUS_STYLES: Record<PersonStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  wishlist: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  archived: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<PersonStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  wishlist: "Wishlist",
  archived: "Archived",
};

const ROLE_STYLES: Record<ContributionRole, string> = {
  main: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  supporting: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  background: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

const ROLE_LABELS: Record<ContributionRole, string> = {
  main: "Main",
  supporting: "Supporting",
  background: "Background",
};

const SET_TYPE_STYLES: Record<SetType, string> = {
  photo: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  video: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
};

const SOURCE_STYLES: Record<RelationshipSource, string> = {
  derived: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  manual: "bg-primary/15 text-primary border-primary/30",
};

function formatBirthdate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatReleaseDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
  return <p className="text-sm text-muted-foreground/70 italic">{message}</p>;
}

function StatusBadge({ status }: { status: PersonStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < rating;
        return filled ? (
          <Star
            key={i}
            size={16}
            className="fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
        ) : (
          <StarOff
            key={i}
            size={16}
            className="text-muted-foreground/30"
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

// ── Profile fields ─────────────────────────────────────────────────────────

type ProfileField = {
  label: string;
  value: string;
};

function buildProfileFields(
  person: Awaited<ReturnType<typeof getPersonWithDetails>>,
): ProfileField[] {
  if (!person) return [];
  const fields: ProfileField[] = [];

  if (person.birthdate)
    fields.push({ label: "Birthdate", value: formatBirthdate(person.birthdate) });
  if (person.nationality) fields.push({ label: "Nationality", value: person.nationality });
  if (person.ethnicity) fields.push({ label: "Ethnicity", value: person.ethnicity });
  if (person.location) fields.push({ label: "Location", value: person.location });
  if (person.height) fields.push({ label: "Height", value: `${person.height} cm` });
  if (person.hairColor) fields.push({ label: "Hair Color", value: person.hairColor });
  if (person.eyeColor) fields.push({ label: "Eye Color", value: person.eyeColor });
  if (person.bodyType) fields.push({ label: "Body Type", value: person.bodyType });
  if (person.measurements) fields.push({ label: "Measurements", value: person.measurements });
  if (person.activeSince)
    fields.push({ label: "Active Since", value: String(person.activeSince) });
  if (person.specialization)
    fields.push({ label: "Specialization", value: person.specialization });

  return fields;
}

// ── Work history section ────────────────────────────────────────────────────

function WorkHistorySection({ items }: { items: PersonWorkHistoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState message="No work history recorded." />;
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Title</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Role</th>
            <th className="pb-2 pr-4 font-medium">Label</th>
            <th className="pb-2 font-medium">Released</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {items.map((item) => (
            <tr
              key={item.setId}
              className="group transition-colors hover:bg-white/5"
            >
              <td className="py-2.5 pr-4">
                <Link
                  href={`/sets/${item.setId}`}
                  className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {item.setTitle}
                </Link>
                {item.projectName && (
                  <p className="text-xs text-muted-foreground">{item.projectName}</p>
                )}
              </td>
              <td className="py-2.5 pr-4">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    SET_TYPE_STYLES[item.setType],
                  )}
                >
                  {item.setType === "photo" ? (
                    <Camera size={10} className="mr-1" />
                  ) : (
                    <Film size={10} className="mr-1" />
                  )}
                  {item.setType}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    ROLE_STYLES[item.role],
                  )}
                >
                  {ROLE_LABELS[item.role]}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">
                {item.labelName ?? <span className="opacity-40">—</span>}
              </td>
              <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                {item.releaseDate ? (
                  formatReleaseDate(item.releaseDate)
                ) : (
                  <span className="opacity-40">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Affiliations section ────────────────────────────────────────────────────

function AffiliationsSection({ items }: { items: PersonAffiliation[] }) {
  if (items.length === 0) {
    return <EmptyState message="No label affiliations." />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((aff) => (
        <div
          key={aff.labelId}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-card/50 px-3 py-2"
        >
          <Building2 size={14} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">{aff.labelName}</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            {aff.setCount}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Connections section ─────────────────────────────────────────────────────

function ConnectionsSection({ items }: { items: PersonConnection[] }) {
  if (items.length === 0) {
    return <EmptyState message="No connections recorded." />;
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((conn) => {
        const displayName =
          conn.primaryAlias ?? `${conn.firstName} ${conn.lastName}`;
        return (
          <Link
            key={conn.personId}
            href={`/people/${conn.personId}`}
            className="group flex items-center gap-3 rounded-xl border border-white/15 bg-card/40 p-3 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {getInitials(conn.firstName, conn.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-hover:text-primary">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {conn.sharedSetCount} shared {conn.sharedSetCount === 1 ? "set" : "sets"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  SOURCE_STYLES[conn.source],
                )}
              >
                {conn.source}
              </span>
              {conn.label && (
                <span className="text-xs text-muted-foreground/70 italic">
                  {conn.label}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { id } = await params;

  const [person, workHistory, affiliations, connections, photos] = await Promise.all([
    getPersonWithDetails(id),
    getPersonWorkHistory(id),
    getPersonAffiliations(id),
    getPersonConnections(id),
    getPhotosForEntity("person", id),
  ]);

  if (!person) notFound();

  const primaryAlias = person.aliases.find((a) => a.isPrimary)?.name;
  const displayName = primaryAlias ?? `${person.firstName} ${person.lastName}`;
  const initials = getInitials(person.firstName, person.lastName);
  const profileFields = buildProfileFields(person);

  // Strip variants from photos before passing to client component (RSC payload safety)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const photoProps = photos.map(({ variants, ...rest }) => rest);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/people"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span aria-hidden="true">←</span>
        Back to People
      </Link>

      {/* Desktop: two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Section 1: Header */}
          <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
            {/* Avatar */}
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 text-3xl font-bold text-primary ring-4 ring-primary/20"
                aria-hidden="true"
              >
                {initials}
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
                {primaryAlias && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {person.firstName} {person.lastName}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={person.status} />
                {person.rating !== null && (
                  <StarRating rating={person.rating} />
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Profile */}
          {profileFields.length > 0 && (
            <SectionCard title="Profile" icon={<BookUser size={18} />}>
              <dl className="space-y-2">
                {profileFields.map((field) => (
                  <div key={field.label} className="grid grid-cols-2 gap-x-3 text-sm">
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="font-medium">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          )}

          {/* Section 9: Notes & Tags */}
          {(person.notes || person.tags.length > 0 || person.rating !== null) && (
            <SectionCard title="Notes" icon={<Tag size={18} />}>
              {person.rating !== null && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rating</span>
                  <StarRating rating={person.rating} />
                  <span className="text-sm font-semibold">{person.rating}/5</span>
                </div>
              )}
              {person.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {person.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {person.notes && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {person.notes}
                </p>
              )}
            </SectionCard>
          )}
        </div>

        {/* ── MAIN CONTENT ──────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Section 4: Aliases */}
          <SectionCard title="Aliases" icon={<Fingerprint size={18} />}>
            {person.aliases.filter((a) => !a.deletedAt).length === 0 ? (
              <EmptyState message="No aliases recorded." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {person.aliases
                  .filter((a) => !a.deletedAt)
                  .map((alias) => (
                    <div
                      key={alias.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                        alias.isPrimary
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "border-white/15 bg-muted/50 text-foreground",
                      )}
                    >
                      {alias.isPrimary && (
                        <Star size={11} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                      )}
                      {alias.name}
                      {alias.isPrimary && (
                        <span className="sr-only">(primary)</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>

          {/* Section 3: Personas */}
          <SectionCard title="Personas" icon={<Users size={18} />}>
            {person.personas.filter((p) => !p.deletedAt).length === 0 ? (
              <EmptyState message="No personas recorded." />
            ) : (
              <div className="space-y-3">
                {person.personas
                  .filter((persona) => !persona.deletedAt)
                  .map((persona) => (
                    <div
                      key={persona.id}
                      className="rounded-xl border border-white/10 bg-card/40 p-4"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-medium">{persona.name}</span>
                        {persona.isBaseline && (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            Real Identity
                          </span>
                        )}
                      </div>
                      {persona.description && (
                        <p className="text-sm text-muted-foreground">{persona.description}</p>
                      )}
                      {persona.notes && (
                        <p className="mt-1 text-xs text-muted-foreground/70 italic">
                          {persona.notes}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>

          {/* Section 5: Photos */}
          <ImageGallery
            photos={photoProps as Parameters<typeof ImageGallery>[0]["photos"]}
            entityType="person"
            entityId={id}
          />

          {/* Section 6: Work History */}
          <SectionCard
            title={`Work History${workHistory.length > 0 ? ` (${workHistory.length})` : ""}`}
            icon={<Film size={18} />}
          >
            <WorkHistorySection items={workHistory} />
          </SectionCard>

          {/* Section 7: Affiliations */}
          <SectionCard
            title={`Label Affiliations${affiliations.length > 0 ? ` (${affiliations.length})` : ""}`}
            icon={<Network size={18} />}
          >
            <AffiliationsSection items={affiliations} />
          </SectionCard>

          {/* Section 8: Connections */}
          <SectionCard
            title={`Connections${connections.length > 0 ? ` (${connections.length})` : ""}`}
            icon={<MapPin size={18} />}
          >
            <ConnectionsSection items={connections} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
