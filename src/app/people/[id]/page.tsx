import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Camera, ArrowRight, ImageIcon } from "lucide-react";
import {
  getPersonWithDetails,
  getPersonWorkHistory,
  getPersonConnections,
  deriveCurrentState,
  deriveAffiliations,
} from "@/lib/services/person-service";
import { getPhotosForEntity } from "@/lib/services/photo-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import { getPersonReferenceSession } from "@/lib/services/session-service";
import { getPersonHeadshots } from "@/lib/services/media-service";
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

  const [person, workHistory, connections, photos, profileLabels, refSession, headshots] =
    await Promise.all([
      getPersonWithDetails(id),
      getPersonWorkHistory(id),
      getPersonConnections(id),
      getPhotosForEntity("person", id),
      getProfileImageLabels(),
      getPersonReferenceSession(id),
      getPersonHeadshots(id),
    ]);

  if (!person) notFound();

  const currentState = deriveCurrentState(person);
  const affiliations = deriveAffiliations(workHistory);

  // Strip variants from photos before passing to client component (RSC payload safety)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const photoProps = photos.map(({ variants, ...rest }) => rest);

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
        photos={photoProps as Parameters<typeof PersonDetailTabs>[0]["photos"]}
        profileLabels={profileLabels}
      />
    </div>
  );
}
