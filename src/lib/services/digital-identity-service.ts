import { prisma } from "@/lib/db";
import type { PersonDigitalIdentityItem } from "@/lib/types";
import type { CreateDigitalIdentityInput, UpdateDigitalIdentityInput } from "@/lib/validations/digital-identity";

export async function getPersonDigitalIdentities(personId: string): Promise<PersonDigitalIdentityItem[]> {
  const identities = await prisma.personDigitalIdentity.findMany({
    where: { personId },
    include: { persona: { select: { label: true } } },
    orderBy: { validFrom: "asc" },
  });

  return identities.map((i) => ({
    id: i.id,
    platform: i.platform,
    handle: i.handle,
    url: i.url,
    status: i.status,
    validFrom: i.validFrom,
    validTo: i.validTo,
    personaLabel: i.persona?.label ?? null,
  }));
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
  return prisma.personDigitalIdentity.delete({
    where: { id },
  });
}
