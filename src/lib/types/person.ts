export type {
  Person,
  PersonAlias,
  Persona,
  PersonRelationship,
  PersonStatus,
  AliasType,
  RelationshipSource,
  BodyMarkType,
  BodyMarkStatus,
  BodyMarkEventType,
  DatePrecision,
  BodyModificationType,
  BodyModificationStatus,
  BodyModificationEventType,
  CosmeticProcedureEventType,
  EducationType,
  AwardType,
  RelationshipType,
  RelationshipEventType,
  AliasSource,
  SkillLevel,
  SkillEventType,
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
  birthdate: Date | null;
  nationality: string | null;
  birthAlias: string | null;
};

export type PersonWorkHistoryItem = {
  setId: string;
  setTitle: string;
  setType: import("@/generated/prisma/client").SetType;
  role: string;
  releaseDate: Date | null;
  releaseDatePrecision: string;
  channelName: string | null;
  labelId: string | null;
  labelName: string | null;
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
  bodyRegions: string[];
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

export type BodyModificationWithEvents = {
  id: string;
  type: import("@/generated/prisma/client").BodyModificationType;
  bodyRegion: string;
  bodyRegions: string[];
  side: string | null;
  position: string | null;
  description: string | null;
  material: string | null;
  gauge: string | null;
  status: import("@/generated/prisma/client").BodyModificationStatus;
  events: {
    id: string;
    eventType: import("@/generated/prisma/client").BodyModificationEventType;
    notes: string | null;
    persona: { id: string; label: string; date: Date | null };
  }[];
};

export type CosmeticProcedureWithEvents = {
  id: string;
  type: string;
  bodyRegion: string;
  bodyRegions: string[];
  description: string | null;
  provider: string | null;
  status: string;
  events: {
    id: string;
    eventType: import("@/generated/prisma/client").CosmeticProcedureEventType;
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

export type SkillEventMediaThumb = {
  id: string;
  thumbUrl: string;
  originalWidth: number;
  originalHeight: number;
};

export type PersonSkillEventItem = {
  id: string;
  eventType: import("@/generated/prisma/client").SkillEventType;
  level: import("@/generated/prisma/client").SkillLevel | null;
  notes: string | null;
  date: Date | null;
  datePrecision: string;
  personaLabel: string | null;
  personaDate: Date | null;
  media: SkillEventMediaThumb[];
};

export type PersonSkillItem = {
  id: string;
  name: string;
  category: string | null;
  level: import("@/generated/prisma/client").SkillLevel | null;
  evidence: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  personaLabel: string | null;
  skillDefinitionId: string | null;
  groupName: string | null;
  definitionName: string | null;
  definitionDescription: string | null;
  definitionPgrade: number | null;
  events: PersonSkillEventItem[];
};

export type SessionThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
};

export type LinkedSetSummary = {
  setId: string;
  title: string;
  type: import("@/generated/prisma/client").SetType;
  releaseDate: Date | null;
  releaseDatePrecision: string;
  channelName: string | null;
};

export type PersonSessionWorkEntry = {
  sessionId: string;
  sessionName: string;
  sessionDate: Date | null;
  sessionDatePrecision: string;
  labelId: string | null;
  labelName: string | null;
  roles: string[];
  mediaCount: number;
  thumbnails: SessionThumbnail[];
  linkedSets: LinkedSetSummary[];
};

export type PersonProductionSession = {
  sessionId: string;
  sessionName: string;
  sessionDate: Date | null;
  sessionDatePrecision: string;
  labelName: string | null;
  roles: string[];
  mediaCount: number;
  previewThumbnails: SessionThumbnail[];
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
  // All body modifications (with events)
  activeBodyModifications: BodyModificationWithEvents[];
  // All cosmetic procedures (with events)
  activeCosmeticProcedures: CosmeticProcedureWithEvents[];
  // Active digital identities
  activeDigitalIdentities: PersonDigitalIdentityItem[];
  // Active skills
  activeSkills: PersonSkillItem[];
};
