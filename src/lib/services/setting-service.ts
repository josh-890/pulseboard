import { prisma } from "@/lib/db";

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

// ── Hero Backdrop Setting ───────────────────────────────────────────────────

export const HERO_BACKDROP_KEY = "hero-backdrop";

export async function getHeroBackdropEnabled(): Promise<boolean> {
  const value = await getSetting(HERO_BACKDROP_KEY);
  return value === "true";
}
