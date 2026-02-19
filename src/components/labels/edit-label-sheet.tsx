"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  updateLabelSchema,
  type UpdateLabelFormValues,
  type UpdateLabelInput,
} from "@/lib/validations/label";
import { updateLabel } from "@/lib/actions/label-actions";

type EditLabelSheetProps = {
  label: { id: string; name: string; description: string | null; website: string | null };
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function EditLabelSheet({ label }: EditLabelSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const form = useForm<UpdateLabelFormValues, unknown, UpdateLabelInput>({
    resolver: zodResolver(updateLabelSchema),
    defaultValues: {
      id: label.id,
      name: label.name,
      description: label.description ?? "",
      website: label.website ?? "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: UpdateLabelInput) {
    const result = await updateLabel(values);

    if (result.success) {
      toast.success("Label updated");
      setOpen(false);
      router.refresh();
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to update label");
  }

  return (
    <Sheet open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        form.reset({
          id: label.id,
          name: label.name,
          description: label.description ?? "",
          website: label.website ?? "",
        });
      }
    }}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={16} />
        Edit
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Edit Label</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Update label details.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-6">
                <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                  <SectionHeader>Details</SectionHeader>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Label name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com" {...field} />
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
                              placeholder="Brief description…"
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>
              </div>
            </div>

            <SheetFooter className="border-t px-4 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
