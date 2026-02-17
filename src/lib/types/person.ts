export type { Person } from "@/generated/prisma/client";

export type ProjectRole = "stakeholder" | "lead" | "member";

export type PersonProjectAssignment = {
  project: import("@/generated/prisma/client").Project;
  role: ProjectRole;
};

export type PersonBrowserItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarColor: string;
  birthdate: Date | null;
  birthplace: string | null;
  jobTitle: string | null;
  department: string | null;
  photoUrl: string | null;
};
