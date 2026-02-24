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

export async function getCosmeticProcedureById(id: string) {
  return prisma.cosmeticProcedure.findUnique({
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

export async function createCosmeticProcedureRecord(data: CreateCosmeticProcedureInput) {
  return prisma.cosmeticProcedure.create({ data });
}

export async function updateCosmeticProcedureRecord(id: string, data: UpdateCosmeticProcedureInput) {
  return prisma.cosmeticProcedure.update({
    where: { id },
    data: {
      type: data.type,
      bodyRegion: data.bodyRegion,
      description: data.description,
      provider: data.provider,
      status: data.status,
    },
  });
}

export async function deleteCosmeticProcedureRecord(id: string) {
  const deletedAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.cosmeticProcedureEvent.updateMany({
      where: { cosmeticProcedureId: id, deletedAt: null },
      data: { deletedAt },
    });
    return tx.cosmeticProcedure.update({
      where: { id },
      data: { deletedAt },
    });
  });
}

export async function createCosmeticProcedureEventRecord(data: CreateCosmeticProcedureEventInput) {
  return prisma.cosmeticProcedureEvent.create({ data });
}

export async function deleteCosmeticProcedureEventRecord(id: string) {
  return prisma.cosmeticProcedureEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
