export type {
  MediaItem,
  MediaType,
  ParticipantRole,
  ResolutionStatus,
  EvidenceType,
  PersonMediaUsage,
  AliasSource,
  SetCreditRaw,
  SetParticipant,
  SetLabelEvidence,
  ChannelLabelMap,
} from "@/generated/prisma/client";

import type { PhotoUrls } from "./photo";

export type MediaItemWithUrls = {
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  caption: string | null;
  createdAt: Date;
  urls: PhotoUrls;
};
