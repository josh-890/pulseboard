import { z } from "zod";

const TAG_DOMAINS = ["PERSON", "CONTENT", "PROJECT", "ANY"] as const;
const TAG_LEVELS = ["SESSION", "SET", "MEDIA_ITEM"] as const;
const TAG_GROUP_KINDS = ["DESCRIPTIVE", "WORKFLOW"] as const;

const groupFields = {
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isExclusive: z.boolean().optional(),
  domain: z.enum(TAG_DOMAINS).optional(),
  typicalLevel: z.enum(TAG_LEVELS).nullable().optional(),
  kind: z.enum(TAG_GROUP_KINDS).optional(),
};

export const createTagGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ...groupFields,
});

export const updateTagGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  ...groupFields,
});

export const createTagDefinitionSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().cuid().nullable().optional(),
  typicalLevel: z.enum(TAG_LEVELS).nullable().optional(),
});

export const updateTagDefinitionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  description: z.string().max(500).nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  typicalLevel: z.enum(TAG_LEVELS).nullable().optional(),
});

export const createTagAliasSchema = z.object({
  tagDefinitionId: z.string().cuid(),
  name: z.string().min(1).max(100),
});

export type CreateTagGroupInput = z.input<typeof createTagGroupSchema>;
export type UpdateTagGroupInput = z.input<typeof updateTagGroupSchema>;
export type CreateTagDefinitionInput = z.input<typeof createTagDefinitionSchema>;
export type UpdateTagDefinitionInput = z.input<typeof updateTagDefinitionSchema>;
