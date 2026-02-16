export type {
  Persona,
  PersonaTrait,
  TraitCategory,
  TraitAction,
} from "@/generated/prisma/client";

export type ComputedTrait = {
  traitCategoryId: string;
  categoryName: string;
  name: string;
  metadata: Record<string, unknown> | null;
  lastModifiedPersonaId: string;
  lastModifiedDate: Date;
};

export type CurrentPersonState = {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarColor: string;
  birthdate: Date | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  address: string | null;
  traits: ComputedTrait[];
  personaCount: number;
  latestPersonaDate: Date | null;
};

export type PersonaTimelineEntry = {
  id: string;
  sequenceNum: number;
  effectiveDate: Date;
  note: string | null;
  scalarChanges: Array<{ field: string; value: string | null }>;
  traitChanges: Array<{
    categoryName: string;
    name: string;
    action: "add" | "remove";
    metadata: Record<string, unknown> | null;
  }>;
};

export type CreatePersonaInput = {
  personId: string;
  effectiveDate: Date;
  note?: string;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
  address?: string | null;
  traits?: Array<{
    traitCategoryId: string;
    name: string;
    action: "add" | "remove";
    metadata?: Record<string, unknown>;
  }>;
};
