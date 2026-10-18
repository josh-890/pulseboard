import type { PhotoUrls } from "./photo";
import type { PersonMediaUsage } from "./media";

export type PersonMediaLinkSummary = {
  id: string;
  usage: PersonMediaUsage;
  bodyRegion: string | null;
  bodyRegions: string[];
  bodyMarkId: string | null;
  bodyModificationId: string | null;
  cosmeticProcedureId: string | null;
  categoryId: string | null;
  eraId: string | null;
  isFavorite: boolean;
  sortOrder: number;
  notes: string | null;
};

/** A cast member for the per-image "people shown" UI (chips, subset badge). */
export type GalleryCastMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  focalX: number | null;
  focalY: number | null;
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
  isFavorite: boolean;
  /** The source file was damaged and decoded leniently — red frame until cleared */
  decodeIssue?: string | null;
  /** The image's direct tags (not inherited) — tile dots; absent when not loaded */
  tags?: import("./tag").TagChipData[];
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
  /** Free-text source clip name for video frames (e.g. "interview_take3.mp4") */
  sourceVideoRef?: string | null;
  /** Timecode offset (ms) at which this frame was extracted from the source clip */
  sourceTimecodeMs?: number | null;
  /** Source session ID — only populated in set gallery context */
  sessionId?: string;
  /** Source session name — only populated in set gallery context */
  sessionName?: string;
  /** Sets this item belongs to — populated in session gallery context */
  setLinks?: { setId: string; setTitle: string }[];
  /**
   * Per-image appearance (ADR-0023), populated in set/session production galleries.
   * `sessionCastIds` = the default cast for this image's session (on-camera Persons);
   * `hiddenPersonIds` = the exclusions. shown = sessionCastIds \ hiddenPersonIds.
   * The subset badge shows only when hiddenPersonIds is non-empty.
   */
  sessionCastIds?: string[];
  hiddenPersonIds?: string[];
  /**
   * Provenance for "copy production image → reference session" copies
   * (ADR-0009 follow-up). Populated by reference-session galleries; lets
   * the lightbox info panel surface a discreet "from [SetName]" link.
   * Deliberately opt-in surface — never rendered on thumbnails or chrome.
   */
  copiedFrom?: {
    mediaItemId: string;
    setId: string | null;
    setTitle: string | null;
  } | null;
};

/**
 * Where an image comes from (2026-10-18) — for galleries that gather images from
 * everywhere (favorites, collections, tags): the set(s) it belongs to, its
 * session, and the people shown in it, so the viewer can jump back to them.
 * A copy (reference session) answers with its source image's sets and people.
 */
export type MediaItemOrigin = {
  /** The image as it sits in those sets — the source image, for a copy */
  imageId: string;
  sets: { id: string; title: string; type: "photo" | "video" }[];
  session: { id: string; name: string; type: "PRODUCTION" | "REFERENCE" };
  /** The person a reference session belongs to */
  referencePerson: { id: string; name: string } | null;
  /** On camera in this image (session cast minus its hidden people), as `Name (ICG-ID)` */
  people: { id: string; name: string }[];
};
