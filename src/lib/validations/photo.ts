import { z } from "zod";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const photoTagValues = [
  "portrait",
  "diploma",
  "tattoo",
  "document",
  "general",
  "outtake",
  "p-img01",
  "p-img02",
  "p-img03",
  "p-img04",
  "p-img05",
] as const;

export const photoUploadSchema = z.object({
  entityType: z.enum(["person", "project"]),
  entityId: z.string().min(1, "Entity ID is required"),
  caption: z.string().max(200, "Caption must be 200 characters or fewer").optional(),
  tags: z.array(z.enum(photoTagValues)).optional(),
});

export type PhotoUploadValues = z.infer<typeof photoUploadSchema>;

export function validatePhotoFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "File size must be 25MB or less";
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return "File must be JPEG, PNG, WebP, or GIF";
  }
  return null;
}

export const setFavoriteSchema = z.object({
  photoId: z.string().min(1),
  entityType: z.enum(["person", "project"]),
  entityId: z.string().min(1),
});

export type SetFavoriteValues = z.infer<typeof setFavoriteSchema>;

export const reorderPhotosSchema = z.object({
  entityType: z.enum(["person", "project"]),
  entityId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ReorderPhotosValues = z.infer<typeof reorderPhotosSchema>;

export const updateTagsSchema = z.object({
  photoId: z.string().min(1),
  tags: z.array(z.enum(photoTagValues)),
  entityType: z.enum(["person", "project"]).optional(),
  entityId: z.string().min(1).optional(),
});

export type UpdateTagsValues = z.infer<typeof updateTagsSchema>;

export const assignProfileSlotSchema = z.object({
  photoId: z.string().min(1),
  entityType: z.enum(["person", "project"]),
  entityId: z.string().min(1),
  slot: z.string().regex(/^p-img0[1-5]$/, "Invalid slot"),
});

export type AssignProfileSlotValues = z.infer<typeof assignProfileSlotSchema>;
