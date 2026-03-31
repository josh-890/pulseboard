import { prisma } from "@/lib/db";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_DELTA,
} from "@/lib/constants/skill";

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

// ── Hero Backdrop Setting ───────────────────────────────────────────────────

export const HERO_BACKDROP_KEY = "hero-backdrop";

export async function getHeroBackdropEnabled(): Promise<boolean> {
  const value = await getSetting(HERO_BACKDROP_KEY);
  return value === "true";
}

// ── Skill Level Configuration ──────────────────────────────────────────────

export type SkillLevelConfig = {
  level: number; // 1-5
  enumKey: SkillLevel;
  label: string;
  delta: number;
};

export async function getSkillLevelConfigs(): Promise<SkillLevelConfig[]> {
  const keys: string[] = [];
  for (let i = 1; i <= 5; i++) {
    keys.push(`skill-level-${i}-label`, `skill-level-${i}-factor`);
  }

  const settings = await prisma.setting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(settings.map((s) => [s.key, s.value]));

  return SKILL_LEVELS.map((enumKey, i) => {
    const n = i + 1;
    return {
      level: n,
      enumKey,
      label: map.get(`skill-level-${n}-label`) ?? SKILL_LEVEL_LABEL[enumKey],
      delta: parseFloat(
        map.get(`skill-level-${n}-factor`) ?? String(SKILL_LEVEL_DELTA[enumKey]),
      ),
    };
  });
}

export async function updateSkillLevelConfig(
  level: number,
  label: string,
  delta: number,
): Promise<void> {
  const labelKey = `skill-level-${level}-label`;
  const factorKey = `skill-level-${level}-factor`;

  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: labelKey },
      update: { value: label },
      create: { key: labelKey, value: label },
    }),
    prisma.setting.upsert({
      where: { key: factorKey },
      update: { value: String(delta) },
      create: { key: factorKey, value: String(delta) },
    }),
  ]);
}
