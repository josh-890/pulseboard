"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileInput, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviewNewerFileAction } from "@/lib/actions/contact-actions";
import type { PersonHint } from "@/lib/services/catalogue-develop-service";

type PersonCatalogueHintProps = {
  personId: string;
  hint: PersonHint;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A newer catalogue file for a developed Person — hint only; Review opens the import review (ADR-0009) */
export function PersonCatalogueHint({ personId, hint }: PersonCatalogueHintProps) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const brings = [
    hint.newSets > 0 && plural(hint.newSets, "new set", "new sets"),
    hint.changedValues > 0 && plural(hint.changedValues, "changed value", "changed values"),
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5"
    >
      <p className="text-sm text-sky-700 dark:text-sky-200">
        <span className="font-medium">Newer catalogue file{hint.fileDate && ` (${hint.fileDate})`}:</span>{" "}
        {brings.join(", ")}
        <span className="text-xs text-sky-700/80 dark:text-sky-200/70">
          {hint.importedDate ? ` · you imported the one from ${hint.importedDate}` : " · never imported from a file"}
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={isPending}
        onClick={() =>
          start(async () => {
            const res = await reviewNewerFileAction(personId);
            if (!res.success) {
              toast.error(res.error);
              return;
            }
            router.push(`/import/${res.batchId}`);
          })
        }
      >
        {isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <FileInput size={13} aria-hidden />}
        Review
      </Button>
    </div>
  );
}
