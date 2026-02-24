import { prisma } from "@/lib/db";
import type {
  CreatePersonEducationInput,
  UpdatePersonEducationInput,
  CreatePersonAwardInput,
  UpdatePersonAwardInput,
} from "@/lib/validations/education";

// ─── Education ──────────────────────────────────────────────────────────────

export async function getPersonEducation(personId: string) {
  return prisma.personEducation.findMany({
    where: { personId },
    orderBy: { startDate: "desc" },
  });
}

export async function createPersonEducationRecord(data: CreatePersonEducationInput) {
  return prisma.personEducation.create({
    data: {
      personId: data.personId,
      type: data.type,
      institution: data.institution,
      field: data.field,
      degree: data.degree,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      startDatePrecision: data.startDatePrecision,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      endDatePrecision: data.endDatePrecision,
      notes: data.notes,
    },
  });
}

export async function updatePersonEducationRecord(id: string, data: UpdatePersonEducationInput) {
  return prisma.personEducation.update({
    where: { id },
    data: {
      type: data.type,
      institution: data.institution,
      field: data.field,
      degree: data.degree,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      startDatePrecision: data.startDatePrecision,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      endDatePrecision: data.endDatePrecision,
      notes: data.notes,
    },
  });
}

export async function deletePersonEducationRecord(id: string) {
  return prisma.personEducation.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ─── Awards ─────────────────────────────────────────────────────────────────

export async function getPersonAwards(personId: string) {
  return prisma.personAward.findMany({
    where: { personId },
    orderBy: { date: "desc" },
  });
}

export async function createPersonAwardRecord(data: CreatePersonAwardInput) {
  return prisma.personAward.create({
    data: {
      personId: data.personId,
      type: data.type,
      name: data.name,
      issuer: data.issuer,
      date: data.date ? new Date(data.date) : undefined,
      datePrecision: data.datePrecision,
      context: data.context,
      url: data.url || undefined,
    },
  });
}

export async function updatePersonAwardRecord(id: string, data: UpdatePersonAwardInput) {
  return prisma.personAward.update({
    where: { id },
    data: {
      type: data.type,
      name: data.name,
      issuer: data.issuer,
      date: data.date ? new Date(data.date) : undefined,
      datePrecision: data.datePrecision,
      context: data.context,
      url: data.url || undefined,
    },
  });
}

export async function deletePersonAwardRecord(id: string) {
  return prisma.personAward.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
