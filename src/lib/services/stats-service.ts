import { prisma } from "@/lib/db";

export async function getDashboardStats() {
  const [total, active, paused, done] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "active" } }),
    prisma.project.count({ where: { status: "paused" } }),
    prisma.project.count({ where: { status: "done" } }),
  ]);
  return { total, active, paused, done };
}

export async function getPeopleStats() {
  return { totalPeople: await prisma.person.count() };
}
