import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" asChild>
        <Link href="/people">
          View All People
          <ArrowRight size={16} className="ml-1" />
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/sets">
          Browse Sets
          <ArrowRight size={16} className="ml-1" />
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/labels">
          View Labels
          <ArrowRight size={16} className="ml-1" />
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/projects">
          View Projects
          <ArrowRight size={16} className="ml-1" />
        </Link>
      </Button>
    </div>
  );
}
