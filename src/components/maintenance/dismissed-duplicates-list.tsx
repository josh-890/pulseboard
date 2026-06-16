"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Undo2, Copy } from "lucide-react";
import { undismissSetDuplicateAction } from "@/lib/actions/set-actions";

type DismissedPair = {
  id: string;
  setIdA: string;
  titleA: string;
  setIdB: string;
  titleB: string;
};

export function DismissedDuplicatesList({ pairs }: { pairs: DismissedPair[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleUndo(id: string) {
    startTransition(async () => {
      await undismissSetDuplicateAction(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <Copy size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Dismissed duplicates</h2>
        <span className="text-xs text-muted-foreground">({pairs.length})</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Pairs you marked &ldquo;not a duplicate&rdquo; — excluded from the Sets duplicate
        detector. Undo to let a pair be flagged again.
      </p>
      <ul className="divide-y divide-white/5">
        {pairs.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1 text-sm">
              <Link href={`/sets/${p.setIdA}`} className="text-foreground/90 hover:text-primary">{p.titleA}</Link>
              <span className="mx-2 text-muted-foreground/50">↔</span>
              <Link href={`/sets/${p.setIdB}`} className="text-foreground/90 hover:text-primary">{p.titleB}</Link>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleUndo(p.id)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground disabled:opacity-50"
            >
              <Undo2 size={12} /> Undo
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
