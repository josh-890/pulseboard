import { prisma } from "@/lib/db";
import type {
  CreatePersonInterestInput,
  UpdatePersonInterestInput,
} from "@/lib/validations/interest";

export async function getPersonInterests(personId: string) {
  return prisma.personInterest.findMany({
    where: { personId },
    orderBy: { name: "asc" },
  });
}

export async function createPersonInterestRecord(data: CreatePersonInterestInput) {
  return prisma.personInterest.create({
    data: {
      personId: data.personId,
      name: data.name,
      category: data.category,
      level: data.level,
      validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
      validFromPrecision: data.validFromPrecision,
      validTo: data.validTo ? new Date(data.validTo) : undefined,
      validToPrecision: data.validToPrecision,
      notes: data.notes,
    },
  });
}

export async function updatePersonInterestRecord(id: string, data: UpdatePersonInterestInput) {
  return prisma.personInterest.update({
    where: { id },
    data: {
      name: data.name,
      category: data.category,
      level: data.level,
      validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
      validFromPrecision: data.validFromPrecision,
      validTo: data.validTo ? new Date(data.validTo) : undefined,
      validToPrecision: data.validToPrecision,
      notes: data.notes,
    },
  });
}

export async function deletePersonInterestRecord(id: string) {
  return prisma.personInterest.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
