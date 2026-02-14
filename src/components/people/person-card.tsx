"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Person, PersonProjectAssignment } from "@/lib/types";
import { PersonAvatar } from "./person-avatar";
import { RoleBadge } from "./role-badge";

type PersonCardProps = {
  person: Person;
  roles: PersonProjectAssignment[];
};

export function PersonCard({ person, roles }: PersonCardProps) {
  const router = useRouter();
  const uniqueRoles = [...new Set(roles.map((r) => r.role))];

  function handleCardClick() {
    router.push(`/people/${person.id}`);
  }

  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(`/people/${person.id}`);
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className="group block cursor-pointer"
    >
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
          {uniqueRoles.map((role) => (
            <Link
              key={role}
              href={`/people/${person.id}?role=${role}`}
              onClick={(e) => e.stopPropagation()}
            >
              <RoleBadge role={role} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
