import { countPersons } from "./person-service";
import { countSets } from "./set-service";
import { countLabels } from "./label-service";
import { countProjects } from "./project-service";

export type DashboardStats = {
  persons: number;
  sets: number;
  labels: number;
  projects: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [persons, sets, labels, projects] = await Promise.all([
    countPersons(),
    countSets(),
    countLabels(),
    countProjects(),
  ]);

  return { persons, sets, labels, projects };
}
