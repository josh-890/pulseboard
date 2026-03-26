import { prisma } from "@/lib/db";
import type {
  CreateCosmeticProcedureInput,
  UpdateCosmeticProcedureInput,
  CreateCosmeticProcedureEventInput,
} from "@/lib/validations/cosmetic-procedure";

export async function getPersonCosmeticProcedures(personId: string) {
  return prisma.cosmeticProcedure.findMany({
    where: { personId },
    include: {
      events: {
        include: {
          persona: { select: { id: true, label: true, date: true, datePrecision: true, isBaseline: true } },
        },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCosmeticProcedureById(id: string) {
  return prisma.cosmeticProcedure.findUnique({
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

export async function createCosmeticProcedureRecord(data: CreateCosmeticProcedureInput) {
  return prisma.cosmeticProcedure.create({ data });
}

export async function updateCosmeticProcedureRecord(id: string, data: UpdateCosmeticProcedureInput) {
  return prisma.cosmeticProcedure.update({
    where: { id },
    data: {
      type: data.type,
      bodyRegion: data.bodyRegion,
      bodyRegions: data.bodyRegions,
      description: data.description,
      provider: data.provider,
      status: data.status,
    },
  });
}

export async function deleteCosmeticProcedureRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.cosmeticProcedureEvent.deleteMany({
      where: { cosmeticProcedureId: id },
    });
    await tx.personMediaLink.deleteMany({
      where: { cosmeticProcedureId: id },
    });
    return tx.cosmeticProcedure.delete({
      where: { id },
    });
  });
}

export async function createCosmeticProcedureEventRecord(data: CreateCosmeticProcedureEventInput) {
  return prisma.cosmeticProcedureEvent.create({ data });
}

export async function deleteCosmeticProcedureEventRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.cosmeticProcedureEvent.delete({ where: { id } });
    const remaining = await tx.cosmeticProcedureEvent.count({
      where: { cosmeticProcedureId: event.cosmeticProcedureId },
    });
    if (remaining === 0) {
      await tx.personMediaLink.deleteMany({ where: { cosmeticProcedureId: event.cosmeticProcedureId } });
      await tx.cosmeticProcedure.delete({ where: { id: event.cosmeticProcedureId } });
    }
    return event;
  });
}
