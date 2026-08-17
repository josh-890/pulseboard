"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { createManualStagingSetAction } from "@/lib/actions/staging-set-actions";
import {
  createStagingSetFromFolderAction,
  findExistingStagingSetAction,
} from "@/lib/actions/attribution-actions";

// ─── Types ─────────────────────────────────────────────────────────────────

type ChannelOption = { id: string; name: string; shortName?: string | null };

type PersonSearchResult = {
  id: string;
  displayName: string;
  icgId: string;
  matchedAlias: string | null;
};

type ParticipantEntry = {
  key: string; // stable key for React
  name: string;
  icgId?: string;
  personId?: string;
  // The alias this person appeared under in THIS set (ADR-0024), distinct from
  // their identity `name`. Pre-filled from the archive folder name, editable.
  usedName?: string;
};

type DatePrecision = "YEAR" | "MONTH" | "DAY" | "UNKNOWN";

export type CreateKnownSetSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPersonId?: string;
  onCreated?: () => void;
  // Archive-folder pre-fill (Archive Browser → "+ Create"):
  initialTitle?: string;
  initialChannelShortName?: string | null;
  initialReleaseDate?: string; // "YYYY-MM-DD"
  initialReleaseDatePrecision?: DatePrecision;
  initialIsVideo?: boolean;
  initialParticipantName?: string | null;
  /**
   * The folder's **confirmed** people, when it has any.
   *
   * Outranks `initialParticipantName`, which is only the alias parsed out of the
   * folder name: an attribution carries the ICG-ID and, where the person is
   * curated, the `personId` — so they arrive resolved instead of as an
   * "unresolved" candidate the operator has to look up again (ADR-0027).
   */
  initialParticipants?: { icgId: string; name: string; personId?: string | null }[];
  /** When set, the created staging set is linked (CONFIRMED) to this archive folder. */
  archiveFolderId?: string;
};

// ─── Component ─────────────────────────────────────────────────────────────

export function CreateKnownSetSheet({
  open,
  onOpenChange,
  initialPersonId,
  onCreated,
  initialTitle,
  initialChannelShortName,
  initialReleaseDate,
  initialReleaseDatePrecision,
  initialIsVideo,
  initialParticipantName,
  initialParticipants,
  archiveFolderId,
}: CreateKnownSetSheetProps) {
  const [isPending, startTransition] = useTransition();

  // Form fields
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseDatePrecision, setReleaseDatePrecision] = useState<DatePrecision>("YEAR");
  const [isVideo, setIsVideo] = useState(false);
  const [externalId, setExternalId] = useState("");
  const [notes, setNotes] = useState("");
  const [participants, setParticipants] = useState<ParticipantEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Channel list
  const [channels, setChannels] = useState<ChannelOption[]>([]);

  // Person search
  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<PersonSearchResult[]>([]);
  const [personSearching, setPersonSearching] = useState(false);
  const [manualName, setManualName] = useState("");

  // Load all channels on mount
  useEffect(() => {
    if (!open) return;
    fetch("/api/channels/search")
      .then((r) => r.json())
      .then((data: ChannelOption[]) => setChannels(data))
      .catch(() => {});
  }, [open]);

  // Pre-populate participant from initialPersonId
  useEffect(() => {
    if (!open || !initialPersonId) return;
    fetch(`/api/people/search?q=${encodeURIComponent(initialPersonId)}`)
      .then((r) => r.json())
      .then((data: PersonSearchResult[]) => {
        const person = data.find((p) => p.id === initialPersonId);
        if (person) {
          setParticipants([
            {
              key: person.id,
              name: person.displayName,
              icgId: person.icgId,
              personId: person.id,
            },
          ]);
        }
      })
      .catch(() => {});
  }, [open, initialPersonId]);

  // Reset + seed on open. Synchronous fields seed from props; channelId and the
  // archive participant resolve in the effects below (they need async data).
  useEffect(() => {
    if (open) {
      setTitle(initialTitle ?? "");
      setChannelId("");
      setReleaseDate(initialReleaseDate ?? "");
      setReleaseDatePrecision(initialReleaseDatePrecision ?? "YEAR");
      setIsVideo(initialIsVideo ?? false);
      setExternalId("");
      setNotes("");
      setParticipants([]);
      setPersonQuery("");
      setPersonResults([]);
      setManualName("");
      setError(null);
    }
  }, [open, initialTitle, initialReleaseDate, initialReleaseDatePrecision, initialIsVideo]);

  // Resolve the folder's channel (by shortName) to a channelId once channels load.
  useEffect(() => {
    if (!open || !initialChannelShortName || channels.length === 0) return;
    const match = channels.find(
      (c) => c.shortName && c.shortName.toLowerCase() === initialChannelShortName.toLowerCase(),
    );
    if (match) setChannelId(match.id);
  }, [open, initialChannelShortName, channels]);

  /**
   * The staged set this folder probably already is.
   *
   * Asked when the sheet opens, so a twin can be prevented rather than cleaned up:
   * a folder often corresponds to a set that arrived through a person's import
   * and was never linked (106 such folders measured on xpulse). Saving anyway is
   * allowed — the service links instead of duplicating — but seeing it first is
   * what stops the operator filling in a form for nothing.
   */
  const [existingMatch, setExistingMatch] = useState<{
    id: string
    title: string
    channelName: string | null
    releaseDate: string | null
    channelAgrees: boolean
  } | null>(null);
  useEffect(() => {
    if (!open || !archiveFolderId) return;
    let cancelled = false;
    findExistingStagingSetAction(archiveFolderId).then((res) => {
      if (!cancelled && res.success) setExistingMatch(res.data);
    });
    return () => { cancelled = true; };
  }, [open, archiveFolderId]);

  // The folder's confirmed people, when it has them: no search, no guessing —
  // the ICG-ID and personId are already the answer.
  useEffect(() => {
    if (!open || !initialParticipants?.length) return;
    setParticipants(
      initialParticipants.map((p) => ({
        key: p.icgId,
        name: p.name,
        icgId: p.icgId,
        ...(p.personId ? { personId: p.personId } : {}),
        // The alias off the folder name is what this set credited them as.
        ...(initialParticipantName ? { usedName: initialParticipantName } : {}),
      })),
    );
  }, [open, initialParticipants, initialParticipantName]);

  // Resolve the participant parsed from the folder name: exact alias match → known,
  // otherwise a candidate row to resolve (never fuzzy-auto-merge).
  //
  // Only when nobody is confirmed for the folder — a parsed alias must never
  // overwrite an attribution.
  useEffect(() => {
    if (!open || !initialParticipantName || initialParticipants?.length) return;
    const name = initialParticipantName;
    let cancelled = false;
    fetch(`/api/people/search?q=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data: PersonSearchResult[]) => {
        if (cancelled) return;
        const exact = data.find((p) => p.displayName?.toLowerCase() === name.toLowerCase());
        setParticipants(
          exact
            ? [{ key: exact.id, name: exact.displayName, icgId: exact.icgId, personId: exact.id, usedName: name }]
            : [{ key: `cand-${name}`, name, usedName: name }],
        );
      })
      .catch(() => {
        if (!cancelled) setParticipants([{ key: `cand-${name}`, name, usedName: name }]);
      });
    return () => { cancelled = true; };
  }, [open, initialParticipantName, initialParticipants]);

  // Debounced person search
  useEffect(() => {
    const q = personQuery.trim();
    if (q.length < 2) {
      setPersonResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setPersonSearching(true);
      try {
        const res = await fetch(`/api/people/search?q=${encodeURIComponent(q)}`);
        const data: PersonSearchResult[] = await res.json();
        setPersonResults(data.slice(0, 8));
      } catch {
        setPersonResults([]);
      } finally {
        setPersonSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [personQuery]);

  function addKnownParticipant(person: PersonSearchResult) {
    if (participants.some((p) => p.personId === person.id)) return;
    setParticipants((prev) => {
      // When resolving a lone unresolved candidate (typically the folder-parsed
      // name), carry its used-name onto the resolved row so the alias survives
      // (ADR-0024). With multiple candidates we don't guess — keep them.
      const candidates = prev.filter((p) => !p.personId);
      const carriedUsedName =
        candidates.length === 1 ? (candidates[0].usedName ?? candidates[0].name) : undefined;
      const kept =
        candidates.length === 1
          ? prev.filter((p) => p.personId)
          : prev.filter(
              (p) => p.personId || p.name.toLowerCase() !== person.displayName.toLowerCase(),
            );
      return [
        ...kept,
        {
          key: person.id,
          name: person.displayName,
          icgId: person.icgId,
          personId: person.id,
          usedName: carriedUsedName,
        },
      ];
    });
    setPersonQuery("");
    setPersonResults([]);
  }

  function updateUsedName(key: string, value: string) {
    setParticipants((prev) => prev.map((p) => (p.key === key ? { ...p, usedName: value } : p)));
  }

  function addManualParticipant() {
    const name = manualName.trim();
    if (!name) return;
    setParticipants((prev) => [
      ...prev,
      { key: `manual-${Date.now()}-${Math.random()}`, name },
    ]);
    setManualName("");
  }

  function removeParticipant(key: string) {
    setParticipants((prev) => prev.filter((p) => p.key !== key));
  }

  function handleSubmit() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!channelId) {
      setError("Channel is required.");
      return;
    }
    setError(null);

    const people = participants.map((p) => ({
      name: p.name,
      icgId: p.icgId,
      personId: p.personId,
      usedName: p.usedName?.trim() || undefined,
    }));

    startTransition(async () => {
      // A folder goes through the archive's own path — the same one the develop
      // queue uses — so the set gets the folder's cover, a CONFIRMED link, the
      // review state and PENDING, and an existing staged set is reused rather
      // than duplicated. `createManualStagingSetAction` stays the path for a set
      // that has no folder at all.
      const result = archiveFolderId
        ? await createStagingSetFromFolderAction(archiveFolderId, {
            participants: people,
            overrides: {
              title: title.trim(),
              channelId,
              releaseDate: releaseDate || undefined,
              releaseDatePrecision,
              isVideo,
              externalId: externalId.trim() || undefined,
              notes: notes.trim() || undefined,
            },
          })
        : await createManualStagingSetAction({
            title: title.trim(),
            channelId,
            releaseDate: releaseDate || undefined,
            releaseDatePrecision: releaseDatePrecision,
            isVideo,
            externalId: externalId.trim() || undefined,
            notes: notes.trim() || undefined,
            participants: people,
          });

      if (result.success) {
        const linked = 'data' in result && result.data?.linkedExisting;
        toast.success(
          linked
            ? 'Linked to the staging set that already existed.'
            : archiveFolderId
              ? 'Staging set created from folder.'
              : 'Staging set created.',
        );
        onCreated?.();
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  const channelOptions = channels.map((c) => ({ id: c.id, label: c.name }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg overflow-y-auto">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle>Add known set</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* This folder is probably a set you already have. Saving links to it
              rather than creating a twin — said before the form is filled in. */}
          {existingMatch && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                A staging set for this folder already exists
              </p>
              <p className="mt-1 text-muted-foreground">
                {existingMatch.title}
                {existingMatch.releaseDate ? ` · ${existingMatch.releaseDate}` : ""}
                {existingMatch.channelName ? ` · ${existingMatch.channelName}` : ""}
                {!existingMatch.channelAgrees && " · different channel"}
              </p>
              <p className="mt-1 text-muted-foreground">
                Saving links the folder to it and adds the people — nothing is duplicated.
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ks-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="ks-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Set title"
            />
          </div>

          {/* Channel */}
          <div className="space-y-1.5">
            <Label>Channel <span className="text-destructive">*</span></Label>
            <EntityCombobox
              entities={channelOptions}
              value={channelId}
              onChange={setChannelId}
              placeholder="Select channel..."
              emptyLabel="No channel"
            />
          </div>

          {/* Release date + precision — locale-agnostic YYYY / Month / DD (app standard) */}
          <PartialDateInput
            label="Release date"
            dateValue={releaseDate}
            precisionValue={releaseDatePrecision}
            onDateChange={setReleaseDate}
            onPrecisionChange={(v) => setReleaseDatePrecision(v as DatePrecision)}
          />

          {/* Type toggle */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsVideo(false)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  !isVideo
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/15 bg-muted/30 text-muted-foreground hover:border-white/30",
                )}
              >
                Photo
              </button>
              <button
                type="button"
                onClick={() => setIsVideo(true)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  isVideo
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/15 bg-muted/30 text-muted-foreground hover:border-white/30",
                )}
              >
                Video
              </button>
            </div>
          </div>

          {/* External / Archive ID */}
          <div className="space-y-1.5">
            <Label htmlFor="ks-externalid">Archive / External ID</Label>
            <Input
              id="ks-externalid"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="e.g. catalog number"
            />
          </div>

          {/* Participants */}
          <div className="space-y-1.5">
            <Label>Participants</Label>

            {/* Existing participant list */}
            {participants.length > 0 && (
              <ul className="space-y-1.5 mb-2">
                {participants.map((p) => (
                  <li
                    key={p.key}
                    className="rounded-lg border border-white/15 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.icgId && (
                          <span className="ml-1.5 text-xs text-muted-foreground">{p.icgId}</span>
                        )}
                        {!p.personId && (
                          <span className="ml-1.5 text-xs text-amber-500/80">unresolved</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeParticipant(p.key)}
                        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${p.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {/* Credited-as / used-name (ADR-0024) — only meaningful once the
                        identity is resolved; for candidates the name above IS the credit. */}
                    {p.personId && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground">Credited as</span>
                        <Input
                          value={p.usedName ?? ""}
                          onChange={(e) => updateUsedName(p.key, e.target.value)}
                          placeholder={p.name}
                          className="h-7 text-xs"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Person search */}
            <div className="relative">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  placeholder="Search existing persons..."
                  className="pl-8"
                />
                {personSearching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {personResults.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full rounded-lg border border-white/15 bg-card/95 shadow-lg backdrop-blur-sm">
                  {personResults.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => addKnownParticipant(r)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                      >
                        <span className="font-medium">{r.displayName}</span>
                        <span className="text-xs text-muted-foreground">{r.icgId}</span>
                        {r.matchedAlias && (
                          <span className="ml-auto text-xs text-muted-foreground/70">
                            aka {r.matchedAlias}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Manual name entry */}
            <div className="flex gap-2">
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Or enter name manually..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualParticipant();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addManualParticipant}
                disabled={!manualName.trim()}
              >
                <Plus size={14} />
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="ks-notes">Notes</Label>
            <Textarea
              id="ks-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <SheetFooter className="border-t pt-4 px-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            Create staged set
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
