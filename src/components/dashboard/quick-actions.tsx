import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild>
        <Link href="/projects/new">
          <Plus size={16} className="mr-1" />
          New Project
        </Link>
      </Button>
      <Button asChild>
        <Link href="/people/new">
          <Plus size={16} className="mr-1" />
          New Person
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/projects">
          View All Projects
          <ArrowRight size={16} className="ml-1" />
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/people">
          View All People
          <ArrowRight size={16} className="ml-1" />
        </Link>
      </Button>
    </div>
  );
}
