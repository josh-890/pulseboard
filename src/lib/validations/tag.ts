import { z } from "zod";

const VALID_SCOPES = ["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"] as const;

export const createTagGroupSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(500).optional(),
});

export const updateTagGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const createTagDefinitionSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().min(1).max(100),
  scope: z.array(z.enum(VALID_SCOPES)).min(1).optional(),
});

export const updateTagDefinitionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scope: z.array(z.enum(VALID_SCOPES)).min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
