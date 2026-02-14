import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects";
import { getProjectById } from "@/lib/services/project-service";
import {
  getPersons,
  getPersonsByProject,
} from "@/lib/services/person-service";
import type { ProjectFormValues } from "@/lib/validations/project";

type EditProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProjectPage({
  params,
}: EditProjectPageProps) {
  const { id } = await params;
  const [project, persons, team] = await Promise.all([
    getProjectById(id),
    getPersons(),
    getPersonsByProject(id),
  ]);

  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/projects">
            <ArrowLeft size={16} className="mr-2" />
            Back to Projects
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg text-muted-foreground">Project not found</p>
        </div>
      </div>
    );
  }

  const defaultValues: ProjectFormValues = {
    name: project.name,
    description: project.description,
    status: project.status,
    tags: project.tags,
    stakeholderId: project.stakeholderId,
    leadId: project.leadId,
    memberIds: team
      .filter((t) => t.role === "member")
      .map((t) => t.person.id),
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href={`/projects/${id}`}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Project
        </Link>
      </Button>

      <h1 className="text-3xl font-bold">Edit Project</h1>

      <ProjectForm
        mode="edit"
        defaultValues={defaultValues}
        projectId={id}
        persons={persons}
      />
    </div>
  );
}
