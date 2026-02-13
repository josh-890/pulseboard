export type ProjectRole = "stakeholder" | "lead" | "member";

export type Person = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarColor: string;
};

export type PersonProjectAssignment = {
  project: import("./project").Project;
  role: ProjectRole;
};
