import Link from "next/link";
import { ArrowLeft, Images, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/projects/status-badge";
import { ProjectTeamSection } from "@/components/projects/project-team-section";
import { DeleteButton } from "@/components/shared";
import { CarouselHeader } from "@/components/photos";
import { formatRelativeTime } from "@/lib/utils";
import { getProjectById } from "@/lib/services/project-service";
import { getPersonsByProject } from "@/lib/services/person-service";
import { getPhotosForEntity } from "@/lib/services/photo-service";
import { deleteProject } from "@/lib/actions/project-actions";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  const [project, team, photos] = await Promise.all([
    getProjectById(id),
    getPersonsByProject(id),
    getPhotosForEntity("project", id),
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

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/projects">
          <ArrowLeft size={16} className="mr-2" />
          Back to Projects
        </Link>
      </Button>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <div className="mb-4 flex items-start gap-5">
          {photos.length > 0 && (
            <div className="hidden md:block">
              <CarouselHeader
                photos={photos}
                entityType="project"
                entityId={id}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <div className="flex items-center gap-2">
                <StatusBadge status={project.status} />
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/projects/${project.id}/edit`}>
                    <Pencil size={14} className="mr-1" />
                    Edit
                  </Link>
                </Button>
                <DeleteButton
                  title="Delete project?"
                  description={`This will permanently remove "${project.name}" and all associated member assignments.`}
                  onDelete={deleteProject.bind(null, project.id)}
                  redirectTo="/projects"
                />
              </div>
            </div>

            <p className="mb-6 text-muted-foreground">{project.description}</p>

            <div className="mb-6 flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Last updated: {formatRelativeTime(project.updatedAt)}
              </p>
              <Link
                href={`/projects/${id}/gallery`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Images size={14} />
                {photos.length > 0
                  ? `View Gallery (${photos.length})`
                  : "Add Photos"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <ProjectTeamSection team={team} />
    </div>
  );
}
