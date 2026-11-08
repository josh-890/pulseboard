import type { TagDomain } from "@/generated/prisma/client";

// Pure (client-safe) half of ADR-0033's domain rule: which group domains may
// carry tags on each entity type. The server enforces it in entity-tag-service;
// the client uses it to grey out slots and palette entries that cannot apply.

export const TAGGABLE_ENTITIES = [
  "PERSON",
  "SESSION",
  "MEDIA_ITEM",
  "SET",
  "PROJECT",
  "ARCHIVE_FOLDER",
  "CHANNEL",
  "LABEL",
  "ARTIST",
] as const;

export type TaggableEntity = (typeof TAGGABLE_ENTITIES)[number];

/** Parse an untrusted value (query param, request body) into an entity type */
export function parseTaggableEntity(value: unknown): TaggableEntity | undefined {
  return TAGGABLE_ENTITIES.find((t) => t === value);
}

export function domainsForEntity(entityType: TaggableEntity): TagDomain[] {
  switch (entityType) {
    case "PERSON":
      return ["PERSON", "ANY"];
    case "PROJECT":
      return ["PROJECT", "ANY"];
    case "SESSION":
    case "SET":
    case "MEDIA_ITEM":
    // An archive folder is a set's copy on disk (ADR-0034): content tags only
    case "ARCHIVE_FOLDER":
    // The makers (2026-11-08): their style is content — "outdoor", "lingerie"
    case "CHANNEL":
    case "LABEL":
    case "ARTIST":
      return ["CONTENT", "ANY"];
  }
}

export function tagFitsEntity(domain: TagDomain, entityType: TaggableEntity): boolean {
  return domainsForEntity(entityType).includes(domain);
}
