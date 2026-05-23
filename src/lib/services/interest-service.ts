import { prisma } from "@/lib/db";
import type { Prisma, DatePrecision } from "@/generated/prisma/client";
import type {
  CreatePersonInterestInput,
  UpdatePersonInterestInput,
} from "@/lib/validations/interest";
import { deriveInterval } from "@/lib/utils/event-interval";

// Resolve the era for an interest event — interests have no parent eraId,
// so we always anchor to the person's baseline era (Phase C1 invariant: every
// person has exactly one baseline era).
async function baselineEraId(tx: Prisma.TransactionClient, personId: string): Promise<string> {
  const baseline = await tx.era.findFirstOrThrow({
    where: { personId, isBaseline: true },
    select: { id: true },
  });
  return baseline.id;
}

// Replace the added/removed event pair for an interest with the given dates.
// Idempotent — deletes any prior added/removed events on the interest first.
async function syncInterestEvents(
  tx: Prisma.TransactionClient,
  interestId: string,
  personId: string,
  validFrom: Date | null,
  validFromPrecision: DatePrecision,
  validTo: Date | null,
  validToPrecision: DatePrecision,
): Promise<void> {
  await tx.interestEvent.deleteMany({
    where: { interestId, eventType: { in: ["added", "removed"] } },
  });
  if (validFrom === null && validTo === null) return; // nothing to record

  const eraId = await baselineEraId(tx, personId);
  const events: Prisma.InterestEventCreateManyInput[] = [];
  if (validFrom !== null) {
    events.push({ interestId, eraId, eventType: "added", date: validFrom, datePrecision: validFromPrecision });
  }
  if (validTo !== null) {
    events.push({ interestId, eraId, eventType: "removed", date: validTo, datePrecision: validToPrecision });
  }
  if (events.length > 0) await tx.interestEvent.createMany({ data: events });
}

export async function getPersonInterests(personId: string) {
  const interests = await prisma.personInterest.findMany({
    where: { personId },
    include: { events: { select: { date: true, eventType: true, datePrecision: true } } },
    orderBy: { name: "asc" },
  });

  return interests.map((i) => {
    const { validFrom, validTo } = deriveInterval(i.events);
    // Surface precision from the corresponding event for UI display.
    const sortedAsc = [...i.events].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return a.date.getTime() - b.date.getTime();
    });
    const validFromPrecision = sortedAsc.find((e) => e.eventType === "added")?.datePrecision ?? "UNKNOWN";
    const validToPrecision = sortedAsc.find((e) => e.eventType === "removed")?.datePrecision ?? "UNKNOWN";
    return {
      id: i.id,
      personId: i.personId,
      name: i.name,
      category: i.category,
      level: i.level,
      notes: i.notes,
      createdAt: i.createdAt,
      validFrom,
      validFromPrecision,
      validTo,
      validToPrecision,
    };
  });
}

export async function createPersonInterestRecord(data: CreatePersonInterestInput) {
  return prisma.$transaction(async (tx) => {
    const interest = await tx.personInterest.create({
      data: {
        personId: data.personId,
        name: data.name,
        category: data.category,
        level: data.level,
        notes: data.notes,
      },
    });
    await syncInterestEvents(
      tx,
      interest.id,
      data.personId,
      data.validFrom ? new Date(data.validFrom) : null,
      data.validFromPrecision,
      data.validTo ? new Date(data.validTo) : null,
      data.validToPrecision,
    );
    return interest;
  });
}

export async function updatePersonInterestRecord(id: string, data: UpdatePersonInterestInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.personInterest.findUniqueOrThrow({
      where: { id },
      select: { personId: true },
    });
    const interest = await tx.personInterest.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        level: data.level,
        notes: data.notes,
      },
    });
    await syncInterestEvents(
      tx,
      id,
      existing.personId,
      data.validFrom ? new Date(data.validFrom) : null,
      data.validFromPrecision,
      data.validTo ? new Date(data.validTo) : null,
      data.validToPrecision,
    );
    return interest;
  });
}

export async function deletePersonInterestRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.interestEvent.deleteMany({ where: { interestId: id } });
    return tx.personInterest.delete({ where: { id } });
  });
}
