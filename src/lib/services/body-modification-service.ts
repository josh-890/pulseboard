import { prisma } from "@/lib/db";
import type {
  CreateBodyModificationInput,
  UpdateBodyModificationInput,
  CreateBodyModificationEventInput,
} from "@/lib/validations/body-modification";

export async function getPersonBodyModifications(personId: string) {
  return prisma.bodyModification.findMany({
    where: { personId },
    include: {
      events: {
        where: { deletedAt: null },
        include: {
          persona: { select: { id: true, label: true, date: true } },
        },
        orderBy: { persona: { date: "asc" } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getBodyModificationById(id: string) {
  return prisma.bodyModification.findUnique({
    where: { id },
    include: {
      events: {
        where: { deletedAt: null },
        include: {
          persona: { select: { id: true, label: true, date: true } },
        },
      },
    },
  });
}

export async function createBodyModificationRecord(data: CreateBodyModificationInput) {
  return prisma.bodyModification.create({ data });
}

export async function updateBodyModificationRecord(id: string, data: UpdateBodyModificationInput) {
  return prisma.bodyModification.update({
    where: { id },
    data: {
      type: data.type,
      bodyRegion: data.bodyRegion,
      side: data.side,
      position: data.position,
      description: data.description,
      material: data.material,
      gauge: data.gauge,
      status: data.status,
    },
  });
}

export async function deleteBodyModificationRecord(id: string) {
  const deletedAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.bodyModificationEvent.updateMany({
      where: { bodyModificationId: id, deletedAt: null },
      data: { deletedAt },
    });
    return tx.bodyModification.update({
      where: { id },
      data: { deletedAt },
    });
  });
}

export async function createBodyModificationEventRecord(data: CreateBodyModificationEventInput) {
  return prisma.bodyModificationEvent.create({ data });
}

export async function deleteBodyModificationEventRecord(id: string) {
  return prisma.bodyModificationEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
