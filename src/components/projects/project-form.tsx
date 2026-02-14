"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TagInput, PersonSelect, MemberMultiSelect } from "@/components/shared";
import {
  projectFormSchema,
  type ProjectFormValues,
} from "@/lib/validations/project";
import { createProject, updateProject } from "@/lib/actions/project-actions";
import type { Person } from "@/lib/types";

type ProjectFormProps = {
  mode: "create" | "edit";
  defaultValues?: ProjectFormValues;
  projectId?: string;
  persons: Person[];
};

export function ProjectForm({
  mode,
  defaultValues,
  projectId,
  persons,
}: ProjectFormProps) {
  const router = useRouter();
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema) as Resolver<ProjectFormValues>,
    defaultValues: defaultValues ?? {
      name: "",
      description: "",
      status: "active",
      tags: [],
      stakeholderId: "",
      leadId: "",
      memberIds: [],
    },
  });

  const stakeholderId = form.watch("stakeholderId");
  const leadId = form.watch("leadId");

  async function onSubmit(values: ProjectFormValues) {
    const result =
      mode === "create"
        ? await createProject(values)
        : await updateProject(projectId!, values);

    if (result.success) {
      toast.success(
        mode === "create" ? "Project created" : "Project updated",
      );
      router.push(
        mode === "create" ? "/projects" : `/projects/${projectId}`,
      );
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Project name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Brief description of the project"
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <Controller
            control={form.control}
            name="tags"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <FormControl>
                  <TagInput value={field.value} onChange={field.onChange} />
                </FormControl>
                {fieldState.error && (
                  <FormMessage>{fieldState.error.message}</FormMessage>
                )}
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="stakeholderId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Stakeholder</FormLabel>
                  <FormControl>
                    <PersonSelect
                      persons={persons}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select stakeholder"
                    />
                  </FormControl>
                  {fieldState.error && (
                    <FormMessage>{fieldState.error.message}</FormMessage>
                  )}
                </FormItem>
              )}
            />

            <Controller
              control={form.control}
              name="leadId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Lead</FormLabel>
                  <FormControl>
                    <PersonSelect
                      persons={persons}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select lead"
                    />
                  </FormControl>
                  {fieldState.error && (
                    <FormMessage>{fieldState.error.message}</FormMessage>
                  )}
                </FormItem>
              )}
            />
          </div>

          <Controller
            control={form.control}
            name="memberIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Members</FormLabel>
                <FormControl>
                  <MemberMultiSelect
                    persons={persons}
                    value={field.value}
                    onChange={field.onChange}
                    excludeIds={[stakeholderId, leadId].filter(Boolean)}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Loader2 size={16} className="mr-2 animate-spin" />
              )}
              {mode === "create" ? "Create Project" : "Save Changes"}
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
