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
import { createManualStagingSetAction } from "@/lib/actions/staging-set-actions";

// ─── Types ─────────────────────────────────────────────────────────────────

type ChannelOption = { id: string; name: string };

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
};

type DatePrecision = "YEAR" | "MONTH" | "DAY" | "UNKNOWN";

export type CreateKnownSetSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPersonId?: string;
  onCreated?: () => void;
};

// ─── Component ─────────────────────────────────────────────────────────────

export function CreateKnownSetSheet({
  open,
  onOpenChange,
  initialPersonId,
  onCreated,
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

  // Reset on open
  useEffect(() => {
    if (open) {
      setTitle("");
      setChannelId("");
      setReleaseDate("");
      setReleaseDatePrecision("YEAR");
      setIsVideo(false);
      setExternalId("");
      setNotes("");
      setParticipants([]);
      setPersonQuery("");
      setPersonResults([]);
      setManualName("");
      setError(null);
    }
  }, [open]);

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
    setParticipants((prev) => [
      ...prev,
      { key: person.id, name: person.displayName, icgId: person.icgId, personId: person.id },
    ]);
    setPersonQuery("");
    setPersonResults([]);
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

    startTransition(async () => {
      const result = await createManualStagingSetAction({
        title: title.trim(),
        channelId,
        releaseDate: releaseDate || undefined,
        releaseDatePrecision: releaseDatePrecision,
        isVideo,
        externalId: externalId.trim() || undefined,
        notes: notes.trim() || undefined,
        participants: participants.map((p) => ({
          name: p.name,
          icgId: p.icgId,
          personId: p.personId,
        })),
      });

      if (result.success) {
        toast.success("Staging set created.");
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

          {/* Release date + precision */}
          <div className="space-y-1.5">
            <Label htmlFor="ks-date">Release date</Label>
            <div className="flex gap-2">
              <Input
                id="ks-date"
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="flex-1"
              />
              <select
                value={releaseDatePrecision}
                onChange={(e) => setReleaseDatePrecision(e.target.value as DatePrecision)}
                className="rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Date precision"
              >
                <option value="DAY">Day</option>
                <option value="MONTH">Month</option>
                <option value="YEAR">Year</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
          </div>

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
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-muted/20 px-3 py-2 text-sm"
                  >
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
