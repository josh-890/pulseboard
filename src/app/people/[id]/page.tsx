import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getPersonWithDetails,
  getPersonWorkHistory,
  getPersonAffiliations,
  getPersonConnections,
  computePersonCurrentState,
} from "@/lib/services/person-service";
import { getPhotosForEntity } from "@/lib/services/photo-service";
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

  const [person, currentState, workHistory, affiliations, connections, photos] =
    await Promise.all([
      getPersonWithDetails(id),
      computePersonCurrentState(id),
      getPersonWorkHistory(id),
      getPersonAffiliations(id),
      getPersonConnections(id),
      getPhotosForEntity("person", id),
    ]);

  if (!person) notFound();

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

      <PersonDetailTabs
        person={person}
        currentState={currentState}
        workHistory={workHistory}
        affiliations={affiliations}
        connections={connections}
        photos={photoProps as Parameters<typeof PersonDetailTabs>[0]["photos"]}
      />
    </div>
  );
}
