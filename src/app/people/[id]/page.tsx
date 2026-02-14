import Link from "next/link";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/people/person-avatar";
import { RoleBadge } from "@/components/people/role-badge";
import { StatusBadge } from "@/components/projects/status-badge";
import { DeleteButton } from "@/components/shared";
import {
  getPersonById,
  getPersonRoles,
} from "@/lib/services/person-service";
import { deletePerson } from "@/lib/actions/person-actions";
import type { ProjectRole } from "@/lib/types";

const validRoles: ProjectRole[] = ["stakeholder", "lead", "member"];

type PersonDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string }>;
};

export default async function PersonDetailPage({
  params,
  searchParams,
}: PersonDetailPageProps) {
  const { id } = await params;
  const { role: roleParam } = await searchParams;
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

  const allAssignments = await getPersonRoles(person.id);
  const activeRole =
    roleParam && validRoles.includes(roleParam as ProjectRole)
      ? (roleParam as ProjectRole)
      : null;
  const assignments = activeRole
    ? allAssignments.filter((a) => a.role === activeRole)
    : allAssignments;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/people">
          <ArrowLeft size={16} className="mr-2" />
          Back to People
        </Link>
      </Button>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/people/${person.id}/edit`}>
                <Pencil size={14} className="mr-1" />
                Edit
              </Link>
            </Button>
            <DeleteButton
              title="Delete person?"
              description={`This will remove "${person.firstName} ${person.lastName}" from all projects.`}
              onDelete={deletePerson.bind(null, person.id)}
              redirectTo="/people"
            />
          </div>
        </div>
      </div>

      {allAssignments.length > 0 && (
        <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Projects</h2>
            {activeRole && (
              <div className="flex items-center gap-2">
                <RoleBadge role={activeRole} />
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/people/${person.id}`}>
                    <X size={14} className="mr-1" />
                    Show all
                  </Link>
                </Button>
              </div>
            )}
          </div>
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
            {assignments.length === 0 && activeRole && (
              <p className="py-4 text-center text-muted-foreground">
                No projects with role &ldquo;{activeRole}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
