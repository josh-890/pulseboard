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
  BodyMarkWithEvents,
  PersonDigitalIdentityItem,
  PersonSkillItem,
  PersonCurrentState,
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

export type {
  MediaItem,
  MediaType,
  MediaItemWithUrls,
  ParticipantRole,
  ResolutionStatus,
  EvidenceType,
  PersonMediaUsage,
  SetCreditRaw,
  SetParticipant,
  SetLabelEvidence,
  ChannelLabelMap,
} from "./media";

export type { GalleryItem, PersonMediaLinkSummary } from "./gallery";

export type { ActivityItem, ActivityType } from "./activity";

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
