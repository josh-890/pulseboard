export type ProjectStatus = "active" | "paused" | "done";

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  updatedAt: string;
  tags: string[];
  stakeholderId: string;
  leadId: string;
  memberIds: string[];
};
