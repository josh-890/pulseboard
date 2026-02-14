"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ColorPicker } from "@/components/shared";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  personFormSchema,
  AVATAR_COLORS,
  type PersonFormValues,
} from "@/lib/validations/person";
import { createPerson, updatePerson } from "@/lib/actions/person-actions";

type PersonFormProps = {
  mode: "create" | "edit";
  defaultValues?: PersonFormValues;
  personId?: string;
};

export function PersonForm({ mode, defaultValues, personId }: PersonFormProps) {
  const router = useRouter();
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema) as Resolver<PersonFormValues>,
    defaultValues: defaultValues ?? {
      firstName: "",
      lastName: "",
      email: "",
      avatarColor: AVATAR_COLORS[0],
    },
  });

  const firstName = form.watch("firstName");
  const lastName = form.watch("lastName");
  const avatarColor = form.watch("avatarColor");

  async function onSubmit(values: PersonFormValues) {
    const result =
      mode === "create"
        ? await createPerson(values)
        : await updatePerson(personId!, values);

    if (result.success) {
      toast.success(
        mode === "create" ? "Person created" : "Person updated",
      );
      router.push(
        mode === "create" ? "/people" : `/people/${personId}`,
      );
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {(firstName || lastName) && (
            <div className="flex justify-center">
              <PersonAvatar
                firstName={firstName || "?"}
                lastName={lastName || "?"}
                avatarColor={avatarColor}
                size="lg"
              />
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder="First name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Last name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="email@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Controller
            control={form.control}
            name="avatarColor"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Avatar Color</FormLabel>
                <FormControl>
                  <ColorPicker
                    value={field.value}
                    onChange={field.onChange}
                    colors={AVATAR_COLORS}
                  />
                </FormControl>
                {fieldState.error && (
                  <FormMessage>{fieldState.error.message}</FormMessage>
                )}
              </FormItem>
            )}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Loader2 size={16} className="mr-2 animate-spin" />
              )}
              {mode === "create" ? "Create Person" : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
