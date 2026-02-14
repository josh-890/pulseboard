import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects";
import { getPersons } from "@/lib/services/person-service";

export default async function NewProjectPage() {
  const persons = await getPersons();

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/projects">
          <ArrowLeft size={16} className="mr-2" />
          Back to Projects
        </Link>
      </Button>

      <h1 className="text-3xl font-bold">New Project</h1>

      <ProjectForm mode="create" persons={persons} />
    </div>
  );
}
