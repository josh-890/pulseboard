import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
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

async function findPersonIdsBySnapshotFields(
  query: string,
): Promise<string[]> {
  const pattern = `%${query.toLowerCase()}%`;
  const rows = await prisma.$queryRaw<Array<{ personId: string }>>(
    Prisma.sql`
      SELECT DISTINCT ps."personId"
      FROM "PersonSnapshot" ps
      WHERE ps."deletedAt" IS NULL
        AND (
          LOWER(ps."jobTitle") LIKE ${pattern}
          OR LOWER(ps."department") LIKE ${pattern}
          OR LOWER(ps."address") LIKE ${pattern}
        )
    `,
  );
  return rows.map((r) => r.personId);
}

async function findPersonIdsByTraitName(query: string): Promise<string[]> {
  const pattern = `%${query.toLowerCase()}%`;
  const rows = await prisma.$queryRaw<Array<{ personId: string }>>(
    Prisma.sql`
      SELECT DISTINCT ps."personId"
      FROM "PersonSnapshot" ps,
           jsonb_array_elements(ps."activeTraits") AS t
      WHERE ps."deletedAt" IS NULL
        AND LOWER(t->>'name') LIKE ${pattern}
    `,
  );
  return rows.map((r) => r.personId);
}

async function findPersonIdsByTraitCategory(
  categoryId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ personId: string }>>(
    Prisma.sql`
      SELECT DISTINCT ps."personId"
      FROM "PersonSnapshot" ps,
           jsonb_array_elements(ps."activeTraits") AS t
      WHERE ps."deletedAt" IS NULL
        AND t->>'traitCategoryId' = ${categoryId}
    `,
  );
  return rows.map((r) => r.personId);
}

export async function searchPersons(
  query: string,
  role?: ProjectRole | "all",
  traitCategory?: string,
): Promise<Person[]> {
  const normalizedQuery = query.toLowerCase().trim();

  // Build the where clause
  const conditions: Prisma.PersonWhereInput[] = [];

  if (normalizedQuery) {
    // Get snapshot-matching person IDs via raw SQL
    const [snapshotFieldIds, traitMatchIds] = await Promise.all([
      findPersonIdsBySnapshotFields(normalizedQuery),
      findPersonIdsByTraitName(normalizedQuery),
    ]);

    const snapshotMatchIds = [
      ...new Set([...snapshotFieldIds, ...traitMatchIds]),
    ];

    const orConditions: Prisma.PersonWhereInput[] = [
      { firstName: { contains: normalizedQuery, mode: "insensitive" } },
      { lastName: { contains: normalizedQuery, mode: "insensitive" } },
      { email: { contains: normalizedQuery, mode: "insensitive" } },
    ];

    if (snapshotMatchIds.length > 0) {
      orConditions.push({ id: { in: snapshotMatchIds } });
    }

    conditions.push({ OR: orConditions });
  }

  if (traitCategory) {
    const categoryMatchIds =
      await findPersonIdsByTraitCategory(traitCategory);
    conditions.push({ id: { in: categoryMatchIds } });
  }

  const persons = await prisma.person.findMany({
    where: conditions.length > 0 ? { AND: conditions } : {},
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
