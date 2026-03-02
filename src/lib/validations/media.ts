import { z } from "zod";

// ── Media upload (used by /api/media/upload endpoint) ────────────────────────

const personMediaUsageValues = [
  "PROFILE",
  "HEADSHOT",
  "BODY_MARK",
  "BODY_MODIFICATION",
  "COSMETIC_PROCEDURE",
  "PORTFOLIO",
] as const;

export const mediaUploadSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  personId: z.string().optional(),
  setId: z.string().optional(),
  usage: z.enum(personMediaUsageValues).optional(),
  slot: z.coerce.number().min(1).max(5).optional(),
  sortOrder: z.coerce.number().optional(),
});

export type MediaUploadValues = z.infer<typeof mediaUploadSchema>;
