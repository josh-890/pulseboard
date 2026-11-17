"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookImage, Check, Images, Layers, Loader2, Trash2, Undo2, Upload } from "lucide-react";
import { useStoredValue } from "@/lib/hooks/use-stored-value";
import { sessionCoverSource, type SessionCoverSet } from "@/lib/session-cover";
import { toast } from "sonner";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { setArtInPhotosAction, setMediaRoleAction } from "@/lib/actions/media-actions";
import { deleteSetMediaAction, setSetCover } from "@/lib/actions/set-actions";
import { setSessionCover } from "@/lib/actions/session-actions";

/** A set of the session, with its own cover (the session's slot groups by these, in cover order) */
export type CoverArtSlotSet = SessionCoverSet;

export type CoverArtSlotProps = {
  /** The set's own cover art, or (session) all cover art in the session */
  items: GalleryItem[];
  coverMediaItemId: string | null;
  /** The cover when it is a photo of the set (no art picked) — shown small */
  coverPhotoUrl?: string | null;
  context:
    | { kind: "set"; setId: string; sessionId: string | null }
    | { kind: "session"; sessionId: string; sets: CoverArtSlotSet[] };
  className?: string;
  /** Hosted in a sheet: told when the slot's own lightbox or delete confirmation is open */
  onOverlayChange?: (overlay: "lightbox" | "confirm" | null) => void;
};

/** One block of the slot: a set (its art, its cover), or — session only — art in no set */
type Group = { key: string; setId: string | null; title: string | null; items: GalleryItem[] };

/**
 * The cover slot (ADR-0040): the publisher's cover art, kept apart from the
 * photos. Cover, let into the photos as well, back to the photos, delete, or
 * upload cover art (which becomes the cover). A session groups the art by its
 * sets; there "Cover" is the cover of that set — a session shows its first
 * set's cover.
 */
export function CoverArtSlot({
  items: initialItems,
  coverMediaItemId,
  coverPhotoUrl,
  context,
  className,
  onOverlayChange,
}: CoverArtSlotProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  // Cover per group key: the set's id, or "session" for art in no set
  const initialCovers = useMemo(
    () =>
      context.kind === "set"
        ? { [context.setId]: coverMediaItemId }
        : {
            ...Object.fromEntries(context.sets.map((s) => [s.id, s.coverMediaItemId])),
            session: coverMediaItemId,
          },
    [context, coverMediaItemId],
  );
  const [covers, setCovers] = useState<Record<string, string | null>>(initialCovers);
  const [open, setOpen] = useState<{ key: string; index: number } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  // A host sheet steps aside for the lightbox and stays open behind a confirmation
  useEffect(() => {
    onOverlayChange?.(open !== null ? "lightbox" : deleteId !== null ? "confirm" : null);
  }, [open, deleteId, onOverlayChange]);

  // A server refresh brings new data
  useEffect(() => setItems(initialItems), [initialItems]);
  useEffect(() => setCovers(initialCovers), [initialCovers]);

  const sessionId = context.sessionId;
  // The session gallery's own switch (grouped by set / flat) — the slot follows it
  const [groupStored, setGroupStored] = useStoredValue<"true" | "false">("gallery_group_session", "false");
  const grouped = context.kind === "session" && groupStored === "true";
  const noun = context.kind === "set" ? "set" : "session";

  const groups: Group[] = useMemo(() => {
    if (context.kind === "set") return [{ key: context.setId, setId: context.setId, title: null, items }];
    // Each file under the first of the session's sets it belongs to
    const order = new Map(context.sets.map((s, i) => [s.id, i]));
    const bySet = new Map<string, GalleryItem[]>(context.sets.map((s) => [s.id, []]));
    const loose: GalleryItem[] = [];
    for (const it of items) {
      const home = (it.setLinks ?? [])
        .map((l) => l.setId)
        .filter((id) => order.has(id))
        .sort((a, b) => order.get(a)! - order.get(b)!)[0];
      if (home) bySet.get(home)!.push(it);
      else loose.push(it);
    }
    const out: Group[] = context.sets.map((s) => ({ key: s.id, setId: s.id, title: s.title, items: bySet.get(s.id)! }));
    if (loose.length > 0) out.push({ key: "session", setId: null, title: "In no set", items: loose });
    return out;
  }, [context, items]);

  /** What is drawn: the groups, or (flat) one block whose files keep their home group */
  const blocks: { key: string; group: Group | null; entries: { item: GalleryItem; home: Group }[] }[] = useMemo(() => {
    if (context.kind === "set" || grouped) {
      return groups.map((g) => ({ key: g.key, group: g, entries: g.items.map((item) => ({ item, home: g })) }));
    }
    const homeOf = new Map(groups.flatMap((g) => g.items.map((it) => [it.id, g] as const)));
    return [{ key: "flat", group: null, entries: items.flatMap((item) => (homeOf.get(item.id) ? [{ item, home: homeOf.get(item.id)! }] : [])) }];
  }, [context.kind, grouped, groups, items]);

  function run(work: () => Promise<{ success: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const r = await work();
      if (!r.success) toast.error(r.error ?? "Something went wrong");
      else if (done) toast.success(done);
      router.refresh();
    });
  }

  function makeCover(group: Group, id: string | null) {
    setCovers((prev) => ({ ...prev, [group.key]: id }));
    run(() => (group.setId ? setSetCover(group.setId, id) : setSessionCover(sessionId ?? "", id)));
  }

  function toggleInPhotos(id: string, on: boolean) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, artInPhotos: on } : it)));
    run(() => setArtInPhotosAction(id, on), on ? "Counts as a photo too" : "Out of the photos");
  }

  function backToPhotos(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    run(() => setMediaRoleAction([id], "PHOTO"), "Moved to the photos");
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setCovers((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v === id ? null : v])));
    const setId = context.kind === "set" ? context.setId : (groups.find((g) => g.items.some((it) => it.id === id))?.setId ?? "");
    run(() => deleteSetMediaAction(setId, sessionId ?? "", [id]), "Cover art deleted");
  }

  function pickUpload(group: Group) {
    uploadTarget.current = group.key;
    fileRef.current?.click();
  }

  async function upload(file: File) {
    const key = uploadTarget.current;
    if (!sessionId || !key) return;
    const group = groups.find((g) => g.key === key);
    setUploading(key);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sessionId", sessionId);
      if (group?.setId) form.set("setId", group.setId);
      form.set("role", "COVER_ART");
      form.set("duplicateAction", "accept");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Upload failed");
        return;
      }
      toast.success("Cover art uploaded — it is the cover now");
      router.refresh();
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const openBlock = open ? blocks.find((b) => b.key === open.key) : undefined;
  const openEntry = open && openBlock ? openBlock.entries[open.index] : undefined;
  const total = items.length;

  return (
    <section
      aria-labelledby="cover-art-title"
      className={cn("rounded-2xl border border-white/20 bg-card/70 p-3 shadow-md backdrop-blur-sm sm:p-4", className)}
      data-testid="cover-art-slot"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BookImage size={14} className="text-muted-foreground" aria-hidden="true" />
        <h2 id="cover-art-title" className="text-sm font-semibold">
          Cover
        </h2>
        <span className="text-xs text-muted-foreground">{total > 0 ? `${total} cover art` : "no cover art"}</span>
        {context.kind === "set" && sessionId && (
          <UploadButton busy={uploading !== null} onClick={() => pickUpload(groups[0]!)} className="ml-auto" />
        )}
        {context.kind === "session" && context.sets.length > 0 && (
          <button
            type="button"
            onClick={() => setGroupStored(grouped ? "false" : "true")}
            title={grouped ? "Show flat" : "Group by Set"}
            aria-pressed={grouped}
            data-testid="cover-art-group-toggle"
            className={cn(
              "ml-auto flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              grouped
                ? "border-entity-session/40 bg-entity-session/15 text-entity-session"
                : "border-white/15 bg-card/60 text-muted-foreground hover:border-entity-session/30 hover:bg-entity-session/10 hover:text-entity-session",
            )}
          >
            <Layers size={14} />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Cover art file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>

      {context.kind === "session" && (
        <SessionShows
          source={sessionCoverSource(
            covers.session ?? null,
            context.sets.map((s) => ({ ...s, coverMediaItemId: covers[s.id] ?? null })),
          )}
          several={context.sets.length > 1}
          onBackToSet={() => {
            setCovers((prev) => ({ ...prev, session: null }));
            run(() => setSessionCover(sessionId ?? "", null), "The session shows its set's cover");
          }}
        />
      )}

      {context.kind === "session" && context.sets.length === 0 && total === 0 && (
        <p className="text-xs text-muted-foreground">This session has no sets yet — cover art belongs to a set.</p>
      )}

      <div className="space-y-4">
        {blocks.map(({ key, group, entries }) => {
          const coverId = group ? (covers[group.key] ?? null) : null;
          const coverIsPhoto = group !== null && coverId !== null && !group.items.some((it) => it.id === coverId);
          return (
            <div key={key} data-testid={group ? "cover-art-group" : "cover-art-flat"} data-set-id={group?.setId ?? ""}>
              {group?.title && (
                <div className="mb-1.5 flex items-center gap-2 border-b border-white/10 pb-1">
                  {group.setId ? (
                    <Link
                      href={`/sets/${group.setId}`}
                      className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-semibold hover:underline"
                    >
                      <span className="truncate">{group.title}</span>
                      <ArrowUpRight size={11} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold">{group.title}</span>
                  )}
                  {group.setId && sessionId && (
                    <UploadButton busy={uploading === group.key} onClick={() => pickUpload(group)} className="ml-auto" />
                  )}
                </div>
              )}
              {entries.length === 0 ? (
                <div className="flex items-center gap-3">
                  {coverIsPhoto && context.kind === "set" && coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPhotoUrl} alt="" className="h-16 w-12 rounded-md object-cover" />
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {coverIsPhoto
                      ? `No cover art — the cover is a photo of the set, and it stays one of its photos.`
                      : `No cover art. Pick a photo with “Set as cover” (#) or upload the publisher's cover.`}
                  </p>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {entries.map(({ item: it, home }, i) => {
                    const isCover = it.id === (covers[home.key] ?? null);
                    const thumb = it.urls.gallery_512 ?? it.urls.gallery_1024 ?? it.urls.original;
                    return (
                      <li key={it.id} className="flex min-w-0 gap-3" data-testid="cover-art-item" data-media-id={it.id}>
                        <button
                          type="button"
                          onClick={() => setOpen({ key, index: i })}
                          className={cn(
                            "relative w-20 shrink-0 overflow-hidden rounded-lg bg-black/30 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isCover && "ring-2 ring-amber-500",
                          )}
                          aria-label={`Open cover art ${it.filename}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumb ?? ""} alt="" className="aspect-[3/4] w-full object-contain" />
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <span className="w-full truncate text-xs font-medium" title={it.filename}>
                            {it.filename}
                          </span>
                          {/* Flat: which set it is the art of */}
                          {!group && home.title && (
                            <span className="w-full truncate text-[11px] text-muted-foreground" title={home.title}>
                              {home.title}
                            </span>
                          )}
                          <div className="mt-auto flex flex-wrap gap-1">
                            {/* Always there, so nothing shifts: lit when it is the cover */}
                            <SlotButton
                              onClick={() => makeCover(home, isCover ? null : it.id)}
                              label={
                                isCover
                                  ? `The cover${home.title ? ` of ${home.title}` : ""} — click to remove it`
                                  : `Set as cover${home.title ? ` of ${home.title}` : ""}`
                              }
                              pressed={isCover}
                              tone="amber"
                            >
                              <Check size={11} />
                              Cover
                            </SlotButton>
                            <SlotButton
                              onClick={() => toggleInPhotos(it.id, !it.artInPhotos)}
                              label={it.artInPhotos ? "Take out of the photos" : "Let into the photos as well"}
                              pressed={it.artInPhotos === true}
                            >
                              <Images size={11} />
                              In photos
                            </SlotButton>
                            <SlotButton onClick={() => backToPhotos(it.id)} label="Not cover art — back to the photos">
                              <Undo2 size={11} />
                            </SlotButton>
                            <SlotButton onClick={() => setDeleteId(it.id)} label="Delete this cover art" danger>
                              <Trash2 size={11} />
                            </SlotButton>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {open !== null && openBlock && openEntry && (
        <GalleryLightbox
          items={openBlock.entries.map((e) => e.item)}
          initialIndex={open.index}
          onClose={() => setOpen(null)}
          // A file's cover is that of its own set
          onSetCover={(id) => {
            const home = openBlock.entries.find((e) => e.item.id === id)?.home ?? openEntry.home;
            makeCover(home, id);
          }}
          coverMediaItemId={covers[openEntry.home.key] ?? null}
          roleList="art"
          onSetRole={(id, role) => (role === "PHOTO" ? backToPhotos(id) : undefined)}
          onSetArtInPhotos={toggleInPhotos}
          onDelete={remove}
          sessionId={sessionId ?? undefined}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cover art?</AlertDialogTitle>
            <AlertDialogDescription>The file is removed for good — from the {noun} and the storage.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteId) remove(deleteId);
                setDeleteId(null);
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

type SessionShowsProps = { source: ReturnType<typeof sessionCoverSource>; several: boolean; onBackToSet: () => void };

/** Where the session's cover comes from: its own pick, or a set's cover */
function SessionShows({ source, several, onBackToSet }: SessionShowsProps) {
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="session-cover-source">
      {source.kind === "own" ? (
        <>
          <span>
            The session shows <span className="font-medium text-foreground">its own pick</span>.
          </span>
          <button
            type="button"
            onClick={onBackToSet}
            className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Back to the set&apos;s cover
          </button>
        </>
      ) : source.kind === "set" ? (
        <span>
          The session shows the cover of <span className="font-medium text-foreground">{source.set.title}</span>
          {several ? " (released first)." : "."}
        </span>
      ) : (
        <span>The session shows its first photo — none of its sets has a cover.</span>
      )}
    </p>
  );
}

type UploadButtonProps = { busy: boolean; onClick: () => void; className?: string };

function UploadButton({ busy, onClick, className }: UploadButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      title="Upload the publisher's cover — it becomes the cover, outside the photos"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
      Upload cover art
    </button>
  );
}

type SlotButtonProps = {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  danger?: boolean;
  tone?: "sky" | "amber";
  children: React.ReactNode;
};

function SlotButton({ onClick, label, pressed, danger, tone = "sky", children }: SlotButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        pressed && tone === "amber"
          ? "bg-amber-500/20 text-amber-700 ring-1 ring-amber-500 dark:text-amber-300"
          : pressed
          ? "bg-sky-500/20 text-sky-600 ring-1 ring-sky-500 dark:text-sky-300"
          : danger
            ? "text-muted-foreground hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400"
            : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
