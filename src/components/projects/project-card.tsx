import Link from "next/link";
import { cn } from "@/lib/utils";
import type { getProjects } from "@/lib/services/project-service";
import type { ProjectStatus } from "@/lib/types";

type ProjectItem = Awaited<ReturnType<typeof getProjects>>[number];

type ProjectCardProps = {
  project: ProjectItem;
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  paused:
    "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed:
    "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const visibleLabels = project.labels.slice(0, 2);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block focus-visible:outline-none"
    >
      <div
        className={cn(
          "rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm",
          "transition-all duration-200",
          "hover:border-white/30 hover:bg-card/90 hover:shadow-lg hover:-translate-y-0.5",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
        )}
      >
        {/* Name + status */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {project.name}
          </h3>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              STATUS_STYLES[project.status],
            )}
          >
            {STATUS_LABELS[project.status]}
          </span>
        </div>

        {/* Labels */}
        {visibleLabels.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {visibleLabels.map(({ label }) => (
              <span
                key={label.id}
                className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {label.name}
              </span>
            ))}
            {project.labels.length > 2 && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                +{project.labels.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground/80">
              {project.sessions.length}
            </span>{" "}
            {project.sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>
      </div>
    </Link>
  );
}
