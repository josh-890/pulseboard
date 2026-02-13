import { projects } from "@/lib/data/projects";
import { persons } from "@/lib/data/persons";

export function getDashboardStats() {
  return {
    total: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    paused: projects.filter((p) => p.status === "paused").length,
    done: projects.filter((p) => p.status === "done").length,
  };
}

export function getPeopleStats() {
  return {
    totalPeople: persons.length,
  };
}
