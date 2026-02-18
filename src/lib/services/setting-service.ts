import { prisma } from "@/lib/db";

export type ProfileImageLabel = {
  slot: string;
  label: string;
};

const PROFILE_SLOTS = [
  "p-img01",
  "p-img02",
  "p-img03",
  "p-img04",
  "p-img05",
] as const;

export async function getProfileImageLabels(): Promise<ProfileImageLabel[]> {
  const keys = PROFILE_SLOTS.map((s) => `${s}-label`);
  const settings = await prisma.setting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(settings.map((s) => [s.key, s.value]));

  return PROFILE_SLOTS.map((slot, i) => ({
    slot,
    label: map.get(`${slot}-label`) ?? `Photo ${i + 1}`,
  }));
}

export async function updateProfileImageLabel(
  slot: string,
  label: string,
): Promise<void> {
  const key = `${slot}-label`;
  await prisma.setting.upsert({
    where: { key },
    update: { value: label },
    create: { key, value: label },
  });
}

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
