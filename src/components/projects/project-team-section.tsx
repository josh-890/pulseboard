import Link from "next/link";
import type { Person, ProjectRole } from "@/lib/types";
import { PersonAvatar } from "@/components/people/person-avatar";
import { RoleBadge } from "@/components/people/role-badge";

type ProjectTeamSectionProps = {
  team: { person: Person; role: ProjectRole }[];
};

export function ProjectTeamSection({ team }: ProjectTeamSectionProps) {
  if (team.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
      <h2 className="mb-4 text-xl font-semibold">Team</h2>
      <div className="space-y-3">
        {team.map(({ person, role }) => (
          <Link
            key={`${person.id}-${role}`}
            href={`/people/${person.id}`}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
          >
            <PersonAvatar
              firstName={person.firstName}
              lastName={person.lastName}
              avatarColor={person.avatarColor}
              size="sm"
            />
            <span className="font-medium">
              {person.firstName} {person.lastName}
            </span>
            <RoleBadge role={role} />
          </Link>
        ))}
      </div>
    </div>
  );
}
