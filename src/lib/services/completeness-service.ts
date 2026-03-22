import { prisma } from "@/lib/db";

export type CompletenessBreakdown = {
  score: number;
  fields: Record<string, { filled: boolean; weight: number; label: string }>;
};

const WEIGHTS = {
  birthdate: 15,
  nationality: 10,
  sexAtBirth: 10,
  ethnicity: 10,
  headshot: 15,
  eyeColor: 5,
  naturalHairColor: 5,
  height: 5,
  currentHairColor: 5,
  build: 5,
  birthPlace: 5,
  birthAlias: 5,
  setParticipation: 5,
} as const;

export async function computeProfileCompleteness(
  personId: string,
): Promise<CompletenessBreakdown> {
  const [person, headshot, setParticipant, baselinePhysical] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      include: {
        aliases: { where: { type: "birth" }, take: 1 },
      },
    }),
    prisma.personMediaLink.findFirst({
      where: { personId, usage: "HEADSHOT" },
    }),
    prisma.setParticipant.findFirst({
      where: { personId },
    }),
    prisma.persona.findFirst({
      where: { personId, isBaseline: true },
      include: { physicalChange: true },
    }),
  ]);

  if (!person) {
    return { score: 0, fields: {} };
  }

  const physical = baselinePhysical?.physicalChange;

  const fields: CompletenessBreakdown["fields"] = {
    birthdate: { filled: person.birthdate !== null, weight: WEIGHTS.birthdate, label: "Birthdate" },
    nationality: { filled: !!person.nationality, weight: WEIGHTS.nationality, label: "Nationality" },
    sexAtBirth: { filled: !!person.sexAtBirth, weight: WEIGHTS.sexAtBirth, label: "Sex at Birth" },
    ethnicity: { filled: !!person.ethnicity, weight: WEIGHTS.ethnicity, label: "Ethnicity" },
    headshot: { filled: headshot !== null, weight: WEIGHTS.headshot, label: "Headshot" },
    eyeColor: { filled: !!person.eyeColor, weight: WEIGHTS.eyeColor, label: "Eye Color" },
    naturalHairColor: { filled: !!person.naturalHairColor, weight: WEIGHTS.naturalHairColor, label: "Natural Hair Color" },
    height: { filled: person.height !== null, weight: WEIGHTS.height, label: "Height" },
    currentHairColor: { filled: !!physical?.currentHairColor, weight: WEIGHTS.currentHairColor, label: "Current Hair Color" },
    build: { filled: !!physical?.build, weight: WEIGHTS.build, label: "Build" },
    birthPlace: { filled: !!person.birthPlace, weight: WEIGHTS.birthPlace, label: "Birth Place" },
    birthAlias: { filled: person.aliases.length > 0, weight: WEIGHTS.birthAlias, label: "Birth Name" },
    setParticipation: { filled: setParticipant !== null, weight: WEIGHTS.setParticipation, label: "Set Participation" },
  };

  const score = Object.values(fields).reduce(
    (sum, f) => sum + (f.filled ? f.weight : 0),
    0,
  );

  return { score, fields };
}

type BatchPersonData = {
  id: string;
  birthdate: Date | null;
  nationality: string | null;
  sexAtBirth: string | null;
  ethnicity: string | null;
  eyeColor: string | null;
  naturalHairColor: string | null;
  height: number | null;
  birthPlace: string | null;
  birthAlias: string | null;
};

export async function batchComputeCompleteness(
  persons: BatchPersonData[],
  personIds: string[],
): Promise<Map<string, number>> {
  if (personIds.length === 0) return new Map();

  const [headshotLinks, setParticipants, baselinePhysicals] = await Promise.all([
    prisma.personMediaLink.findMany({
      where: { personId: { in: personIds }, usage: "HEADSHOT" },
      select: { personId: true },
      distinct: ["personId"],
    }),
    prisma.setParticipant.findMany({
      where: { personId: { in: personIds } },
      select: { personId: true },
      distinct: ["personId"],
    }),
    prisma.persona.findMany({
      where: { personId: { in: personIds }, isBaseline: true },
      include: { physicalChange: true },
    }),
  ]);

  const hasHeadshot = new Set(headshotLinks.map((h) => h.personId));
  const hasSet = new Set(setParticipants.map((s) => s.personId));
  const physicalMap = new Map(
    baselinePhysicals.map((p) => [p.personId, p.physicalChange]),
  );

  const result = new Map<string, number>();

  for (const person of persons) {
    const physical = physicalMap.get(person.id);
    let score = 0;

    if (person.birthdate !== null) score += WEIGHTS.birthdate;
    if (person.nationality) score += WEIGHTS.nationality;
    if (person.sexAtBirth) score += WEIGHTS.sexAtBirth;
    if (person.ethnicity) score += WEIGHTS.ethnicity;
    if (hasHeadshot.has(person.id)) score += WEIGHTS.headshot;
    if (person.eyeColor) score += WEIGHTS.eyeColor;
    if (person.naturalHairColor) score += WEIGHTS.naturalHairColor;
    if (person.height !== null) score += WEIGHTS.height;
    if (physical?.currentHairColor) score += WEIGHTS.currentHairColor;
    if (physical?.build) score += WEIGHTS.build;
    if (person.birthPlace) score += WEIGHTS.birthPlace;
    if (person.birthAlias) score += WEIGHTS.birthAlias;
    if (hasSet.has(person.id)) score += WEIGHTS.setParticipation;

    result.set(person.id, score);
  }

  return result;
}
