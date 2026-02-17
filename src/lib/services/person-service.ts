import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type {
  Person,
  ProjectRole,
  PersonProjectAssignment,
  PersonBrowserItem,
} from "@/lib/types";

export type PersonSearchPage = {
  items: PersonBrowserItem[];
  nextCursor: string | null;
};

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

const MINIO_BASE = process.env.NEXT_PUBLIC_MINIO_URL!;

type RawPersonBrowserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarColor: string;
  birthdate: Date | null;
  birthplace: string | null;
  jobTitle: string | null;
  department: string | null;
  photoKey: string | null;
};

export async function searchPersonsPaginated(
  query?: string,
  role?: ProjectRole | "all",
  traitCategory?: string,
  cursor?: string,
  pageSize = 60,
): Promise<PersonSearchPage> {
  // Step 1: Collect person ID filters from search + trait category
  let filterIds: string[] | null = null;

  const normalizedQuery = query?.toLowerCase().trim() || "";

  if (normalizedQuery) {
    const [snapshotIds, traitIds] = await Promise.all([
      findPersonIdsBySnapshotFields(normalizedQuery),
      findPersonIdsByTraitName(normalizedQuery),
    ]);
    const snapshotMatchIds = [...new Set([...snapshotIds, ...traitIds])];

    // Also search Person fields directly — combine with snapshot matches
    const nameMatchRows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT p."id" FROM "Person" p
        WHERE p."deletedAt" IS NULL AND (
          LOWER(p."firstName") LIKE ${`%${normalizedQuery}%`}
          OR LOWER(p."lastName") LIKE ${`%${normalizedQuery}%`}
          OR LOWER(p."email") LIKE ${`%${normalizedQuery}%`}
        )
      `,
    );
    const nameIds = nameMatchRows.map((r) => r.id);
    filterIds = [...new Set([...nameIds, ...snapshotMatchIds])];

    if (filterIds.length === 0) {
      return { items: [], nextCursor: null };
    }
  }

  if (traitCategory) {
    const categoryIds = await findPersonIdsByTraitCategory(traitCategory);
    if (filterIds) {
      filterIds = filterIds.filter((id) => categoryIds.includes(id));
    } else {
      filterIds = categoryIds;
    }
    if (filterIds.length === 0) {
      return { items: [], nextCursor: null };
    }
  }

  // Step 2: Role filter — get matching person IDs via EXISTS subquery approach
  if (role && role !== "all") {
    let roleIds: string[];
    if (role === "stakeholder") {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT DISTINCT p."stakeholderId" AS id FROM "Project" p WHERE p."deletedAt" IS NULL`,
      );
      roleIds = rows.map((r) => r.id);
    } else if (role === "lead") {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT DISTINCT p."leadId" AS id FROM "Project" p WHERE p."deletedAt" IS NULL`,
      );
      roleIds = rows.map((r) => r.id);
    } else {
      const rows = await prisma.$queryRaw<Array<{ personId: string }>>(
        Prisma.sql`SELECT DISTINCT pm."personId" FROM "ProjectMember" pm WHERE pm."deletedAt" IS NULL`,
      );
      roleIds = rows.map((r) => r.personId);
    }

    if (filterIds) {
      filterIds = filterIds.filter((id) => roleIds.includes(id));
    } else {
      filterIds = roleIds;
    }
    if (filterIds.length === 0) {
      return { items: [], nextCursor: null };
    }
  }

  // Step 3: Build keyset pagination cursor condition
  let cursorCondition = Prisma.sql``;
  if (cursor) {
    const cursorRow = await prisma.$queryRaw<
      Array<{ lastName: string; firstName: string; id: string }>
    >(
      Prisma.sql`
        SELECT "lastName", "firstName", "id" FROM "Person"
        WHERE "id" = ${cursor} AND "deletedAt" IS NULL
        LIMIT 1
      `,
    );
    if (cursorRow.length > 0) {
      const { lastName, firstName, id } = cursorRow[0];
      cursorCondition = Prisma.sql`
        AND (p."lastName", p."firstName", p."id") > (${lastName}, ${firstName}, ${id})
      `;
    }
  }

  // Step 4: Build ID filter condition
  let idCondition = Prisma.sql``;
  if (filterIds) {
    idCondition = Prisma.sql`AND p."id" = ANY(${filterIds})`;
  }

  // Step 5: Main query — join Person + PersonSnapshot + Photo (ranked)
  const rows = await prisma.$queryRaw<RawPersonBrowserRow[]>(
    Prisma.sql`
      SELECT
        p."id",
        p."firstName",
        p."lastName",
        p."email",
        p."avatarColor",
        p."birthdate",
        p."birthplace",
        ps."jobTitle",
        ps."department",
        ph."photoKey"
      FROM "Person" p
      LEFT JOIN "PersonSnapshot" ps
        ON ps."personId" = p."id" AND ps."deletedAt" IS NULL
      LEFT JOIN LATERAL (
        SELECT (ph2."variants"->>'profile_256') AS "photoKey"
        FROM "Photo" ph2
        WHERE ph2."entityType" = 'person'
          AND ph2."entityId" = p."id"
          AND ph2."deletedAt" IS NULL
        ORDER BY ph2."isFavorite" DESC, ph2."sortOrder" ASC
        LIMIT 1
      ) ph ON true
      WHERE p."deletedAt" IS NULL
        ${idCondition}
        ${cursorCondition}
      ORDER BY p."lastName" ASC, p."firstName" ASC, p."id" ASC
      LIMIT ${pageSize + 1}
    `,
  );

  const hasMore = rows.length > pageSize;
  const items: PersonBrowserItem[] = rows.slice(0, pageSize).map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    avatarColor: row.avatarColor,
    birthdate: row.birthdate,
    birthplace: row.birthplace,
    jobTitle: row.jobTitle,
    department: row.department,
    photoUrl: row.photoKey ? `${MINIO_BASE}/${row.photoKey}` : null,
  }));

  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { items, nextCursor };
}
