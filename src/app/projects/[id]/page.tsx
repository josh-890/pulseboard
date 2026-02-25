import { notFound } from "next/navigation";
import Link from "next/link";
import { Camera, Film, FolderKanban, Tag } from "lucide-react";
import { getProjectById } from "@/lib/services/project-service";
import { getChannelsForSelect } from "@/lib/services/set-service";
import { cn, formatPartialDate } from "@/lib/utils";
import type { ProjectStatus, SetType } from "@/lib/types";
import { EditProjectSheet } from "@/components/projects/edit-project-sheet";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteProject } from "@/lib/actions/project-actions";
import { AddSetToSessionSheet } from "@/components/sets/add-set-to-session-sheet";

export const dynamic = "force-dynamic";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

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

const SET_TYPE_STYLES: Record<SetType, string> = {
  photo: "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  video:
    "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

// ── Main page ───────────────────────────────────────────────────────────────

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;

  const [project, channels] = await Promise.all([
    getProjectById(id),
    getChannelsForSelect(),
  ]);

  if (!project) notFound();

  const totalSets = project.sessions.reduce(
    (sum, session) => sum + session.sets.length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden="true">←</span>
          Back to Projects
        </Link>
        <div className="flex items-center gap-2">
          <EditProjectSheet project={project} />
          <DeleteButton
            title="Delete project?"
            description="This will permanently remove the project and all associated sessions and sets. This action cannot be undone."
            onDelete={deleteProject.bind(null, id)}
            redirectTo="/projects"
          />
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                <FolderKanban size={18} className="text-primary" />
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  STATUS_STYLES[project.status],
                )}
              >
                {STATUS_LABELS[project.status]}
              </span>
            </div>
            <h1 className="text-2xl font-bold leading-tight">{project.name}</h1>

            {project.description && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="flex shrink-0 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{project.sessions.length}</p>
              <p className="text-xs text-muted-foreground">
                {project.sessions.length === 1 ? "Session" : "Sessions"}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{totalSets}</p>
              <p className="text-xs text-muted-foreground">
                {totalSets === 1 ? "Set" : "Sets"}
              </p>
            </div>
          </div>
        </div>

        {/* Labels */}
        {project.labels.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.labels.map(({ label }) => (
              <Link
                key={label.id}
                href={`/labels/${label.id}`}
                className="inline-flex items-center rounded-full border border-white/20 bg-muted/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 hover:text-primary"
              >
                {label.name}
              </Link>
            ))}
          </div>
        )}

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tag size={13} className="text-muted-foreground" aria-hidden="true" />
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-white/10 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sessions */}
      {project.sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-card/70 py-16 text-center shadow-md backdrop-blur-sm">
          <FolderKanban size={40} className="mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">No sessions yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {project.sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm"
            >
              {/* Session header */}
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{session.name}</h2>
                  {session.date && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPartialDate(session.date, session.datePrecision)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/15 bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {session.sets.length} {session.sets.length === 1 ? "set" : "sets"}
                  </span>
                  <AddSetToSessionSheet
                    session={{
                      id: session.id,
                      name: session.name,
                      projectId: project.id,
                      projectName: project.name,
                      labelIds: project.labels.map((l) => l.labelId),
                    }}
                    channels={channels}
                  />
                </div>
              </div>

              {/* Sets list */}
              {session.sets.length === 0 ? (
                <p className="text-sm italic text-muted-foreground/70">
                  No sets in this session.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {session.sets.map((set) => (
                    <li key={set.id}>
                      <Link
                        href={`/sets/${set.id}`}
                        className="group flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0",
                            SET_TYPE_STYLES[set.type],
                          )}
                        >
                          {set.type === "photo" ? (
                            <Camera size={10} />
                          ) : (
                            <Film size={10} />
                          )}
                          {set.type === "photo" ? "Photo" : "Video"}
                        </span>
                        <span className="text-sm font-medium text-foreground/90 group-hover:text-primary transition-colors">
                          {set.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
