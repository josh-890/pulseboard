import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonForm } from "@/components/people";

export default function NewPersonPage() {
  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/people">
          <ArrowLeft size={16} className="mr-2" />
          Back to People
        </Link>
      </Button>

      <h1 className="text-3xl font-bold">New Person</h1>

      <PersonForm mode="create" />
    </div>
  );
}
