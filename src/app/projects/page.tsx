"use client";

import { useState } from "react";
import { ProjectSearch } from "@/components/projects/project-search";
import { StatusFilter } from "@/components/projects/status-filter";
import { ProjectList } from "@/components/projects/project-list";
import { searchProjects } from "@/lib/services/project-service";
import type { ProjectStatus } from "@/lib/types";

export default function ProjectsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");

  const projects = searchProjects(query, status);

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">Projects</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <ProjectSearch value={query} onChange={setQuery} />
        </div>
        <StatusFilter value={status} onChange={setStatus} />
      </div>
      <ProjectList projects={projects} />
    </div>
  );
}
