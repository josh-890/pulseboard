import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./status-badge";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/lib/types";

type ProjectCardProps = {
  project: Project;
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl md:p-6 dark:border-white/10">
        <div className="mb-3 flex items-start justify-between">
          <h3 className="text-lg font-semibold group-hover:text-primary">
            {project.name}
          </h3>
          <StatusBadge status={project.status} />
        </div>
        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
          {project.description}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {project.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Updated {formatRelativeTime(project.updatedAt)}
        </p>
      </div>
    </Link>
  );
}
