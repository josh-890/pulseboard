export type {
  Person,
  PersonAlias,
  Persona,
  PersonRelationship,
  PersonStatus,
  RelationshipSource,
  ContributionRole,
} from "@/generated/prisma/client";

export type PersonWithPrimaryAlias = {
  id: string;
  firstName: string;
  lastName: string;
  status: import("@/generated/prisma/client").PersonStatus;
  rating: number | null;
  tags: string[];
  hairColor: string | null;
  bodyType: string | null;
  ethnicity: string | null;
  location: string | null;
  activeSince: number | null;
  specialization: string | null;
  createdAt: Date;
  primaryAlias: string | null;
};

export type PersonWorkHistoryItem = {
  setId: string;
  setTitle: string;
  setType: import("@/generated/prisma/client").SetType;
  role: import("@/generated/prisma/client").ContributionRole;
  releaseDate: Date | null;
  channelName: string | null;
  labelName: string | null;
  projectName: string | null;
};

export type PersonAffiliation = {
  labelId: string;
  labelName: string;
  setCount: number;
};

export type PersonConnection = {
  personId: string;
  firstName: string;
  lastName: string;
  primaryAlias: string | null;
  sharedSetCount: number;
  source: import("@/generated/prisma/client").RelationshipSource;
  label: string | null;
};
