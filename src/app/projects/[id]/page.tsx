import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/projects/status-badge";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { formatRelativeTime } from "@/lib/utils";
import { getProjectById } from "@/lib/services/project-service";
import { getPersonsByProject } from "@/lib/services/person-service";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  const project = await getProjectById(id);
  const team = await getPersonsByProject(id);

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

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/projects">
          <ArrowLeft size={16} className="mr-2" />
          Back to Projects
        </Link>
      </Button>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>

        <p className="mb-6 text-muted-foreground">{project.description}</p>

        <div className="mb-6 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Last updated: {formatRelativeTime(project.updatedAt)}
        </p>
      </div>

      <ProjectTeamSection team={team} />
    </div>
  );
}
