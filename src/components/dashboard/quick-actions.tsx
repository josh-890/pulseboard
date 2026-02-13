import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActions() {
  return (
    <div className="flex gap-3">
      <Button asChild>
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
