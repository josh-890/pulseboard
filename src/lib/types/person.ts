export type {
  Person,
  PersonAlias,
  Persona,
  PersonRelationship,
  PersonStatus,
  AliasType,
  RelationshipSource,
  ContributionRole,
  BodyMarkType,
  BodyMarkStatus,
  BodyMarkEventType,
} from "@/generated/prisma/client";

export type PersonWithCommonAlias = {
  id: string;
  icgId: string;
  status: import("@/generated/prisma/client").PersonStatus;
  rating: number | null;
  tags: string[];
  naturalHairColor: string | null;
  bodyType: string | null;
  ethnicity: string | null;
  location: string | null;
  activeSince: number | null;
  specialization: string | null;
  createdAt: Date;
  commonAlias: string | null;
};

export type PersonWorkHistoryItem = {
  setId: string;
  setTitle: string;
  setType: import("@/generated/prisma/client").SetType;
  role: import("@/generated/prisma/client").ContributionRole;
  releaseDate: Date | null;
  channelName: string | null;
  labelId: string | null;
  labelName: string | null;
  projectName: string | null;
};

export type PersonAffiliation = {
  labelId: string;
  labelName: string;
  setCount: number;
};

export type PersonConnection = {
  personId: string;
  commonAlias: string | null;
  icgId: string;
  sharedSetCount: number;
  source: import("@/generated/prisma/client").RelationshipSource;
  label: string | null;
};

export type BodyMarkWithEvents = {
  id: string;
  type: import("@/generated/prisma/client").BodyMarkType;
  bodyRegion: string;
  side: string | null;
  position: string | null;
  description: string | null;
  motif: string | null;
  colors: string[];
  size: string | null;
  status: import("@/generated/prisma/client").BodyMarkStatus;
  events: {
    id: string;
    eventType: import("@/generated/prisma/client").BodyMarkEventType;
    notes: string | null;
    persona: { id: string; label: string; date: Date | null };
  }[];
};

export type PersonDigitalIdentityItem = {
  id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  status: string;
  validFrom: Date | null;
  validTo: Date | null;
  personaLabel: string | null;
};

export type PersonSkillItem = {
  id: string;
  name: string;
  category: string | null;
  level: string | null;
  evidence: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  personaLabel: string | null;
};

export type PersonCurrentState = {
  // Latest physical attributes (from PersonaPhysical fold)
  currentHairColor: string | null;
  weight: number | null;
  build: string | null;
  visionAids: string | null;
  fitnessLevel: string | null;
  // Active body marks (status = present)
  activeBodyMarks: BodyMarkWithEvents[];
  // Active digital identities
  activeDigitalIdentities: PersonDigitalIdentityItem[];
  // Active skills
  activeSkills: PersonSkillItem[];
};
