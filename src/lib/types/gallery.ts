import type { PhotoUrls } from "./photo";
import type { PersonMediaUsage } from "./media";

export type PersonMediaLinkSummary = {
  id: string;
  usage: PersonMediaUsage;
  slot: number | null;
  bodyRegion: string | null;
  bodyRegions: string[];
  bodyMarkId: string | null;
  bodyModificationId: string | null;
  cosmeticProcedureId: string | null;
  categoryId: string | null;
  personaId: string | null;
  isFavorite: boolean;
  sortOrder: number;
  notes: string | null;
};

export type GalleryItem = {
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  caption: string | null;
  createdAt: Date;
  urls: PhotoUrls;
  focalX: number | null;
  focalY: number | null;
  tags: string[];
  isFavorite: boolean;
  sortOrder: number;
  isCover: boolean;
  /** Present only in MediaManager contexts */
  links?: PersonMediaLinkSummary[];
  /** Present only in MediaManager contexts */
  collectionIds?: string[];
  /** Skill event IDs linked via SkillEventMedia */
  skillEventIds?: string[];
  /** Number of sets this media item is linked to */
  setCount?: number;
};
