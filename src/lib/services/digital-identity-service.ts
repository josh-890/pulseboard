import { prisma } from "@/lib/db";
import type { PersonDigitalIdentityItem } from "@/lib/types";
import type { CreateDigitalIdentityInput, UpdateDigitalIdentityInput } from "@/lib/validations/digital-identity";
import { deriveInterval } from "@/lib/utils/event-interval";

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
    await tx.digitalIdentityEvent.deleteMany({ where: { digitalIdentityId: id } });
    return tx.personDigitalIdentity.delete({ where: { id } });
  });
}
