export type { Person } from "@/generated/prisma/client";

export type ProjectRole = "stakeholder" | "lead" | "member";

export type PersonProjectAssignment = {
  project: import("@/generated/prisma/client").Project;
  role: ProjectRole;
};
