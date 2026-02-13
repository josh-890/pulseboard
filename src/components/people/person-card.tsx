import Link from "next/link";
import type { Person, PersonProjectAssignment } from "@/lib/types";
import { PersonAvatar } from "./person-avatar";
import { RoleBadge } from "./role-badge";

type PersonCardProps = {
  person: Person;
  roles: PersonProjectAssignment[];
};

export function PersonCard({ person, roles }: PersonCardProps) {
  return (
    <Link href={`/people/${person.id}`} className="group block">
      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl md:p-6 dark:border-white/10">
        <div className="mb-3 flex items-center gap-3">
          <PersonAvatar
            firstName={person.firstName}
            lastName={person.lastName}
            avatarColor={person.avatarColor}
          />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold group-hover:text-primary">
              {person.firstName} {person.lastName}
            </h3>
            <p className="truncate text-sm text-muted-foreground">
              {person.email}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roles.map((assignment) => (
            <RoleBadge key={assignment.project.id} role={assignment.role} />
          ))}
        </div>
      </div>
    </Link>
  );
}
