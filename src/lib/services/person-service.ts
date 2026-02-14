import { prisma } from "@/lib/db";
import type { Person, ProjectRole, PersonProjectAssignment } from "@/lib/types";

export async function getPersons(): Promise<Person[]> {
  return prisma.person.findMany({ orderBy: { lastName: "asc" } });
}

export async function getPersonById(id: string): Promise<Person | null> {
  return prisma.person.findUnique({ where: { id } });
}

export async function getPersonRoles(
  personId: string,
): Promise<PersonProjectAssignment[]> {
  const assignments: PersonProjectAssignment[] = [];

  const [stakeholderProjects, leadProjects, memberProjects] = await Promise.all(
    [
      prisma.project.findMany({ where: { stakeholderId: personId } }),
      prisma.project.findMany({ where: { leadId: personId } }),
      prisma.projectMember.findMany({
        where: { personId },
        include: { project: true },
      }),
    ],
  );

  for (const project of stakeholderProjects) {
    assignments.push({ project, role: "stakeholder" });
  }
  for (const project of leadProjects) {
    assignments.push({ project, role: "lead" });
  }
  for (const membership of memberProjects) {
    assignments.push({ project: membership.project, role: "member" });
  }

  return assignments;
}

export async function getPersonsByProject(
  projectId: string,
): Promise<{ person: Person; role: ProjectRole }[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      stakeholder: true,
      lead: true,
      members: { include: { person: true } },
    },
  });

  if (!project) return [];

  const result: { person: Person; role: ProjectRole }[] = [];

  result.push({ person: project.stakeholder, role: "stakeholder" });
  result.push({ person: project.lead, role: "lead" });

  for (const membership of project.members) {
    result.push({ person: membership.person, role: "member" });
  }

  return result;
}

export async function searchPersons(
  query: string,
  role?: ProjectRole | "all",
): Promise<Person[]> {
  const normalizedQuery = query.toLowerCase().trim();

  const queryFilter = normalizedQuery
    ? {
        OR: [
          {
            firstName: { contains: normalizedQuery, mode: "insensitive" as const },
          },
          {
            lastName: { contains: normalizedQuery, mode: "insensitive" as const },
          },
          { email: { contains: normalizedQuery, mode: "insensitive" as const } },
        ],
      }
    : {};

  const persons = await prisma.person.findMany({
    where: queryFilter,
    orderBy: { lastName: "asc" },
  });

  if (!role || role === "all") return persons;

  const filtered: Person[] = [];
  for (const person of persons) {
    const roles = await getPersonRoles(person.id);
    if (roles.some((r) => r.role === role)) {
      filtered.push(person);
    }
  }
  return filtered;
}
