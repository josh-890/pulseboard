import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/people/person-avatar";
import { RoleBadge } from "@/components/people/role-badge";
import { StatusBadge } from "@/components/projects/status-badge";
import {
  getPersonById,
  getPersonRoles,
} from "@/lib/services/person-service";

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PersonDetailPage({
  params,
}: PersonDetailPageProps) {
  const { id } = await params;
  const person = await getPersonById(id);

  if (!person) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/people">
            <ArrowLeft size={16} className="mr-2" />
            Back to People
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg text-muted-foreground">Person not found</p>
        </div>
      </div>
    );
  }

  const assignments = await getPersonRoles(person.id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/people">
          <ArrowLeft size={16} className="mr-2" />
          Back to People
        </Link>
      </Button>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <div className="mb-4 flex items-center gap-4">
          <PersonAvatar
            firstName={person.firstName}
            lastName={person.lastName}
            avatarColor={person.avatarColor}
            size="lg"
          />
          <div>
            <h1 className="text-3xl font-bold">
              {person.firstName} {person.lastName}
            </h1>
            <p className="text-muted-foreground">{person.email}</p>
          </div>
        </div>
      </div>

      {assignments.length > 0 && (
        <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
          <h2 className="mb-4 text-xl font-semibold">Projects</h2>
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <Link
                key={assignment.project.id}
                href={`/projects/${assignment.project.id}`}
                className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{assignment.project.name}</span>
                  <StatusBadge status={assignment.project.status} />
                </div>
                <RoleBadge role={assignment.role} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
