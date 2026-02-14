import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonForm } from "@/components/people";
import { getPersonById } from "@/lib/services/person-service";
import type { PersonFormValues } from "@/lib/validations/person";

type EditPersonPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPersonPage({ params }: EditPersonPageProps) {
  const { id } = await params;
  const person = await getPersonById(id);

  if (!person) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/people">
            <ArrowLeft size={16} className="mr-2" />
            Back to People
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg text-muted-foreground">Person not found</p>
        </div>
      </div>
    );
  }

  const defaultValues: PersonFormValues = {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    avatarColor: person.avatarColor,
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href={`/people/${id}`}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Person
        </Link>
      </Button>

      <h1 className="text-3xl font-bold">Edit Person</h1>

      <PersonForm mode="edit" defaultValues={defaultValues} personId={id} />
    </div>
  );
}
