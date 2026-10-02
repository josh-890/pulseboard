import type { TagDomain } from "@/generated/prisma/client";

// Pure (client-safe) half of ADR-0033's domain rule: which group domains may
// carry tags on each entity type. The server enforces it in entity-tag-service;
// the client uses it to grey out slots and palette entries that cannot apply.

export type TaggableEntity = "PERSON" | "SESSION" | "MEDIA_ITEM" | "SET" | "PROJECT";

export function domainsForEntity(entityType: TaggableEntity): TagDomain[] {
  switch (entityType) {
    case "PERSON":
      return ["PERSON", "ANY"];
    case "PROJECT":
      return ["PROJECT", "ANY"];
    case "SESSION":
    case "SET":
    case "MEDIA_ITEM":
      return ["CONTENT", "ANY"];
  }
}

export function tagFitsEntity(domain: TagDomain, entityType: TaggableEntity): boolean {
  return domainsForEntity(entityType).includes(domain);
}
