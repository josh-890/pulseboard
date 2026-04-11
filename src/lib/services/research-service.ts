import { prisma } from "@/lib/db";

export type PersonResearchItem = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: Date;
};

export async function getPersonResearch(personId: string): Promise<PersonResearchItem[]> {
  const rows = await prisma.personResearch.findMany({
    where: { personId },
    select: { id: true, title: true, content: true, sortOrder: true, createdAt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

export async function createResearchRecord(personId: string, title: string): Promise<PersonResearchItem> {
  const maxRow = await prisma.personResearch.findFirst({
    where: { personId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextOrder = (maxRow?.sortOrder ?? -1) + 1;
  return prisma.personResearch.create({
    data: { personId, title: title.trim(), content: "", sortOrder: nextOrder },
    select: { id: true, title: true, content: true, sortOrder: true, createdAt: true },
  });
}

export async function updateResearchRecord(
  id: string,
  data: { title?: string; content?: string; sortOrder?: number },
): Promise<PersonResearchItem> {
  return prisma.personResearch.update({
    where: { id },
    data: {
      title: data.title?.trim(),
      content: data.content,
      sortOrder: data.sortOrder,
    },
    select: { id: true, title: true, content: true, sortOrder: true, createdAt: true },
  });
}

export async function deleteResearchRecord(id: string): Promise<void> {
  await prisma.personResearch.delete({ where: { id } });
}
