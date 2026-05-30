import { prisma } from "@/lib/db";
import type { PersonDigitalIdentityItem } from "@/lib/types";
import type { CreateDigitalIdentityInput, UpdateDigitalIdentityInput } from "@/lib/validations/digital-identity";
import { deriveInterval } from "@/lib/utils/event-interval";
import { normaliseDigitalIdentityKey } from "@/lib/services/import/diff";

export async function getPersonDigitalIdentities(personId: string): Promise<PersonDigitalIdentityItem[]> {
  const identities = await prisma.personDigitalIdentity.findMany({
    where: { personId },
    include: {
      era: { select: { label: true } },
      events: { select: { date: true, eventType: true } },
    },
  });

  const mapped: PersonDigitalIdentityItem[] = identities.map((i) => {
    const { validFrom, validTo } = deriveInterval(i.events);
    return {
      id: i.id,
      platform: i.platform,
      handle: i.handle,
      url: i.url,
      status: i.status,
      validFrom,
      validTo,
      eraLabel: i.era?.label ?? null,
    };
  });

  // Sort by reconstructed validFrom ascending (matches the prior orderBy).
  mapped.sort((a, b) => {
    if (!a.validFrom && !b.validFrom) return 0;
    if (!a.validFrom) return -1;
    if (!b.validFrom) return 1;
    return a.validFrom.getTime() - b.validFrom.getTime();
  });
  return mapped;
}

export async function createDigitalIdentity(data: CreateDigitalIdentityInput) {
  return prisma.personDigitalIdentity.create({
    data: {
      personId: data.personId,
      platform: data.platform,
      handle: data.handle || null,
      url: data.url || null,
      status: data.status,
    },
  });
}

export async function updateDigitalIdentity(id: string, data: UpdateDigitalIdentityInput) {
  return prisma.personDigitalIdentity.update({
    where: { id },
    data: {
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.handle !== undefined && { handle: data.handle || null }),
      ...(data.url !== undefined && { url: data.url || null }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });
}

export async function deleteDigitalIdentity(id: string) {
  return prisma.$transaction(async (tx) => {
    // Fetch what we need for the tombstone before deleting.
    const di = await tx.personDigitalIdentity.findUniqueOrThrow({
      where: { id },
      select: { personId: true, platform: true, url: true, handle: true },
    });

    await tx.digitalIdentityEvent.deleteMany({ where: { digitalIdentityId: id } });
    const deleted = await tx.personDigitalIdentity.delete({ where: { id } });

    // ADR-0009 Phase 2: record the manual deletion so a future re-import
    // surfaces "Previously manually deleted ..." next to the matching
    // review row instead of silently proposing to re-create.
    await tx.itemDeletionTombstone.create({
      data: {
        personId: di.personId,
        kind: "digital_identity",
        itemKey: normaliseDigitalIdentityKey(di.platform, di.url ?? di.handle),
      },
    });

    return deleted;
  });
}
