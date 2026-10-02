"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { removeTagsFromEntityAction } from "@/lib/actions/tag-actions";
import type { TodoEntry, TodoTag } from "@/lib/services/tag-browse-service";

const KIND: Record<TodoEntry["entityType"], string> = {
  PERSON: "Person",
  SESSION: "Session",
  SET: "Set",
  MEDIA_ITEM: "Image",
  PROJECT: "Project",
};

// The workflow To-do inbox (ADR-0033, S7): every item carrying a workflow tag,
// per tag. "Done" removes the tag from that item — nothing else changes.
export function TodoInbox({ todos }: { todos: TodoTag[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const markDone = (tag: TodoTag, e: TodoEntry) => {
    const key = `${tag.id}|${e.entityId}`;
    setDone((s) => new Set(s).add(key));
    startTransition(async () => {
      const res = await removeTagsFromEntityAction(e.entityType, e.entityId, [tag.id]);
      if (!res.success) {
        toast.error(res.error ?? "Could not mark done");
        setDone((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
        return;
      }
      router.refresh();
    });
  };

  const open = todos.filter((t) => t.total > 0);
  if (open.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
        <ListTodo size={28} className="mx-auto mb-2 text-muted-foreground/60" />
        Nothing to do. Workflow tags (needs-crop, check-cast, …) put items here; mark them done to clear them.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {open.map((t) => {
        const entries = t.entries.filter((e) => !done.has(`${t.id}|${e.entityId}`));
        const images = entries.filter((e) => e.entityType === "MEDIA_ITEM");
        const others = entries.filter((e) => e.entityType !== "MEDIA_ITEM");
        return (
          <section key={t.id} className="rounded-2xl border border-amber-500/20 bg-card/60 p-4 shadow-sm" aria-label={t.name}>
            <header className="mb-3 flex items-center gap-2">
              <ListTodo size={14} className="text-amber-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{t.name}</h2>
              <span className="text-xs text-muted-foreground">
                {t.total} open{t.total > t.entries.length ? ` · showing ${t.entries.length}` : ""}
              </span>
            </header>
            {others.length > 0 && (
              <ul className="mb-3 divide-y divide-white/5">
                {others.map((e) => (
                  <li key={e.entityId} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{KIND[e.entityType]}</span>
                    <Link href={e.href} className="min-w-0 flex-1 truncate hover:underline">
                      {e.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => markDone(t, e)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-0.5 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label={`Mark ${t.name} done for ${e.label}`}
                    >
                      <Check size={11} /> Done
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {images.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {images.map((e) => (
                  <li key={e.entityId} className="group relative overflow-hidden rounded-lg border border-white/10 bg-muted/30">
                    <Link href={e.href} title={`${e.label} — open its session`}>
                      {e.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.thumbnail} alt={e.label} className="aspect-square w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="aspect-square w-full" />
                      )}
                    </Link>
                    <button
                      type="button"
                      onClick={() => markDone(t, e)}
                      className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-emerald-300 opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label={`Mark ${t.name} done for ${e.label}`}
                    >
                      <Check size={10} /> Done
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
