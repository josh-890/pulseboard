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
        include: {
          persona: { select: { id: true, label: true, date: true, datePrecision: true, isBaseline: true } },
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
        include: {
          persona: { select: { id: true, label: true, date: true, datePrecision: true, isBaseline: true } },
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
      bodyRegions: data.bodyRegions,
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
  return prisma.$transaction(async (tx) => {
    await tx.bodyModificationEvent.deleteMany({
      where: { bodyModificationId: id },
    });
    await tx.personMediaLink.deleteMany({
      where: { bodyModificationId: id },
    });
    return tx.bodyModification.delete({
      where: { id },
    });
  });
}

export async function createBodyModificationEventRecord(data: CreateBodyModificationEventInput) {
  return prisma.bodyModificationEvent.create({ data });
}

export async function deleteBodyModificationEventRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.bodyModificationEvent.delete({ where: { id } });
    const remaining = await tx.bodyModificationEvent.count({
      where: { bodyModificationId: event.bodyModificationId },
    });
    if (remaining === 0) {
      await tx.personMediaLink.deleteMany({ where: { bodyModificationId: event.bodyModificationId } });
      await tx.bodyModification.delete({ where: { id: event.bodyModificationId } });
    }
    return event;
  });
}
