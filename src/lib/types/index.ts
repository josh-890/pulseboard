export type {
  Person,
  PersonAlias,
  Persona,
  PersonRelationship,
  PersonStatus,
  AliasType,
  AliasSource,
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
  PersonWithCommonAlias,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  SessionThumbnail,
  LinkedSetSummary,
  PersonSessionWorkEntry,
  PersonProductionSession,
  BodyMarkEventItem,
  BodyMarkWithEvents,
  BodyModificationEventItem,
  BodyModificationWithEvents,
  CosmeticProcedureEventItem,
  CosmeticProcedureWithEvents,
  PersonDigitalIdentityItem,
  PersonSkillItem,
  PersonSkillEventItem,
  SkillEventMediaThumb,
  PersonCurrentState,
  AttributeStatus,
  ExtensibleAttributeValue,
  SkillLevel,
  SkillEventType,
  DigitalIdentityStatus,
  DateModifier,
  ParticipationConfidence,
  ConfidenceSource,
} from "./person";

export type {
  Project,
  ProjectStatus,
  Set,
  SetType,
} from "./project";

export type { Session, SessionStatus, SessionType, SetSession } from "./session";

export type { Label, Network, Channel, LabelNetworkLink } from "./label";

export type {
  PhotoVariants,
  PhotoUrls,
} from "./photo";

export { parsePhotoVariants } from "./photo";

export type {
  MediaItem,
  MediaType,
  MediaItemWithUrls,
  ResolutionStatus,
  EvidenceType,
  PersonMediaUsage,
  SetCreditRaw,
  SetParticipant,
  SetLabelEvidence,
  ChannelLabelMap,
} from "./media";

export type {
  MediaCategoryGroup,
  MediaCategory,
  SkillGroup,
  SkillDefinition,
} from "@/generated/prisma/client";

export type { GalleryItem, PersonMediaLinkSummary } from "./gallery";

export type { ActivityItem, ActivityType } from "./activity";

export type { CrudActionResult, SimpleActionResult } from "./action-result";

export type { PaletteConfig, PaletteModeConfig } from "./palette";

// ─── Duplicate detection types ──────────────────────────────────────────────

export type DuplicateMatch = {
  mediaItemId: string;
  filename: string;
  thumbnailUrl: string;
  sessionId: string;
  personName: string | null;
  scope: "same_session" | "same_person" | "global";
};

export type SimilarMatch = {
  mediaItemId: string;
  filename: string;
  thumbnailUrl: string;
  originalWidth: number;
  originalHeight: number;
  distance: number;
  personName: string | null;
};
