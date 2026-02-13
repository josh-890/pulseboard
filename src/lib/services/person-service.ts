import { persons } from "@/lib/data/persons";
import { projects } from "@/lib/data/projects";
import type { Person, ProjectRole, PersonProjectAssignment } from "@/lib/types";

export function getPersons(): Person[] {
  return persons;
}

export function getPersonById(id: string): Person | undefined {
  return persons.find((p) => p.id === id);
}

export function getPersonRoles(personId: string): PersonProjectAssignment[] {
  const assignments: PersonProjectAssignment[] = [];

  for (const project of projects) {
    if (project.stakeholderId === personId) {
      assignments.push({ project, role: "stakeholder" });
    }
    if (project.leadId === personId) {
      assignments.push({ project, role: "lead" });
    }
    if (project.memberIds.includes(personId)) {
      assignments.push({ project, role: "member" });
    }
  }

  return assignments;
}

export function getPersonsByProject(
  projectId: string,
): { person: Person; role: ProjectRole }[] {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return [];

  const result: { person: Person; role: ProjectRole }[] = [];

  const stakeholder = persons.find((p) => p.id === project.stakeholderId);
  if (stakeholder) result.push({ person: stakeholder, role: "stakeholder" });

  const lead = persons.find((p) => p.id === project.leadId);
  if (lead) result.push({ person: lead, role: "lead" });

  for (const memberId of project.memberIds) {
    const member = persons.find((p) => p.id === memberId);
    if (member) result.push({ person: member, role: "member" });
  }

  return result;
}

export function searchPersons(
  query: string,
  role?: ProjectRole | "all",
): Person[] {
  const normalizedQuery = query.toLowerCase().trim();

  return persons.filter((person) => {
    const matchesQuery =
      !normalizedQuery ||
      person.firstName.toLowerCase().includes(normalizedQuery) ||
      person.lastName.toLowerCase().includes(normalizedQuery) ||
      person.email.toLowerCase().includes(normalizedQuery) ||
      `${person.firstName} ${person.lastName}`
        .toLowerCase()
        .includes(normalizedQuery);

    if (!matchesQuery) return false;

    if (!role || role === "all") return true;

    const roles = getPersonRoles(person.id);
    return roles.some((r) => r.role === role);
  });
}
