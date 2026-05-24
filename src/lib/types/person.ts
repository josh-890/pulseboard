export type {
  Person,
  PersonAlias,
  Era,
  PersonRelationship,
  PersonStatus,
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
  DateModifier,
  ParticipationConfidence,
  ConfidenceSource,
} from "@/generated/prisma/client";

import type { DigitalIdentityStatus } from "@/generated/prisma/enums";
export type { DigitalIdentityStatus };

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
  activeFrom: Date | null;
  activeFromPrecision: string;
  retiredAt: Date | null;
  retiredAtPrecision: string;
  specialization: string | null;
  createdAt: Date;
  commonAlias: string | null;
  birthdate: Date | null;
  birthdatePrecision: string;
  birthdateModifier: string;
  nationality: string | null;
  birthAlias: string | null;
  completeness: number;
  matchedAlias?: string | null;
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
  confidence: import("@/generated/prisma/client").ParticipationConfidence;
  confidenceSource: import("@/generated/prisma/client").ConfidenceSource;
};

export type StagingWorkHistoryItem = {
  stagingSetId: string;
  title: string;
  channelName: string;
  channelId: string | null;
  releaseDate: Date | null;
  releaseDatePrecision: string;
  isVideo: boolean;
  externalId: string | null;
  coverImageUrl: string | null;
  archiveStatus: import("@/generated/prisma/client").ArchiveStatus | null;
  archiveFileCount: number | null;
  hasSuggestion: boolean;
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

export type BodyMarkEventItem = {
  id: string;
  eventType: import("@/generated/prisma/client").BodyMarkEventType;
  notes: string | null;
  date: Date | null;
  datePrecision: string;
  dateModifier: string;
  era: { id: string; label: string; date: Date | null; datePrecision: string; isBaseline: boolean };
  bodyRegions: string[];
  motif: string | null;
  colors: string[];
  size: string | null;
  description: string | null;
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
  heroVisible: boolean;
  heroOrder: number | null;
  events: BodyMarkEventItem[];
  computed: {
    bodyRegions: string[];
    motif: string | null;
    colors: string[];
    size: string | null;
    description: string | null;
  };
};

export type BodyModificationEventItem = {
  id: string;
  eventType: import("@/generated/prisma/client").BodyModificationEventType;
  notes: string | null;
  date: Date | null;
  datePrecision: string;
  dateModifier: string;
  era: { id: string; label: string; date: Date | null; datePrecision: string; isBaseline: boolean };
  bodyRegions: string[];
  description: string | null;
  material: string | null;
  gauge: string | null;
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
  heroVisible: boolean;
  heroOrder: number | null;
  events: BodyModificationEventItem[];
  computed: {
    bodyRegions: string[];
    description: string | null;
    material: string | null;
    gauge: string | null;
  };
};

export type CosmeticProcedureEventItem = {
  id: string;
  eventType: import("@/generated/prisma/client").CosmeticProcedureEventType;
  notes: string | null;
  date: Date | null;
  datePrecision: string;
  dateModifier: string;
  era: { id: string; label: string; date: Date | null; datePrecision: string; isBaseline: boolean };
  bodyRegions: string[];
  description: string | null;
  provider: string | null;
  valueBefore: string | null;
  valueAfter: string | null;
  unit: string | null;
};

export type AttributeStatus = "NATURAL" | "ENHANCED" | "RESTORED";

export type CosmeticProcedureWithEvents = {
  id: string;
  type: string;
  bodyRegion: string;
  bodyRegions: string[];
  description: string | null;
  provider: string | null;
  status: string;
  attributeDefinitionId: string | null;
  heroVisible: boolean;
  heroOrder: number | null;
  events: CosmeticProcedureEventItem[];
  computed: {
    bodyRegions: string[];
    description: string | null;
    provider: string | null;
    valueAfter: string | null;
    unit: string | null;
  };
};

export type PersonDigitalIdentityItem = {
  id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  status: DigitalIdentityStatus;
  validFrom: Date | null;
  validTo: Date | null;
  eraLabel: string | null;
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
  eraLabel: string | null;
  eraDate: Date | null;
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
  eraLabel: string | null;
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
  sessionDateIsConfirmed: boolean;
  labelId: string | null;
  labelName: string | null;
  roles: string[];
  mediaCount: number;
  thumbnails: SessionThumbnail[];
  linkedSets: LinkedSetSummary[];
  ageAtProduction: string;
  confidence: import("@/generated/prisma/client").ParticipationConfidence;
  confidenceSource: import("@/generated/prisma/client").ConfidenceSource;
  // ADR-0004: linked Era. All of one person's contribution rows within a
  // session share the same eraId (enforced on write), so per-session is safe.
  eraId: string | null;
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
  confidence: import("@/generated/prisma/client").ParticipationConfidence;
  confidenceSource: import("@/generated/prisma/client").ConfidenceSource;
};

export type ExtensibleAttributeValue = {
  value: string;
  unit: string | null;
  name: string;
  groupName: string;
  status: AttributeStatus;
  mutability: import("@/generated/prisma/client").Mutability;
};

export type PersonCurrentState = {
  // Folded current physical scalars (latest ScalarDelta per attribute)
  currentHairColor: string | null;
  weight: number | null;
  build: string | null;
  breastSize: string | null;
  breastStatus: string | null;
  breastDescription: string | null;
  measurements: string | null;
  // Extensible (non-core) physical attributes, folded from ScalarDelta
  extensibleAttributes: Record<string, ExtensibleAttributeValue>;
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
