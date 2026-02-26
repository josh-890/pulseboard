"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  addManualLabelEvidence,
  removeLabelEvidence,
  searchLabelsAction,
} from "@/lib/actions/set-actions";
import { cn } from "@/lib/utils";

type LabelEvidenceItem = {
  setId: string;
  labelId: string;
  evidenceType: string;
  label: { id: string; name: string };
};

type LabelResult = {
  id: string;
  name: string;
};

type LabelEvidenceManagerProps = {
  setId: string;
  evidence: LabelEvidenceItem[];
};

export function LabelEvidenceManager({ setId, evidence: initialEvidence }: LabelEvidenceManagerProps) {
  const router = useRouter();
  const [evidence, setEvidence] = useState(initialEvidence);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LabelResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLabelsAction(q);
      // Filter out labels already in evidence
      const existingIds = new Set(evidence.map((e) => e.labelId));
      setSearchResults(results.filter((r) => !existingIds.has(r.id)));
      setShowDropdown(true);
      setIsSearching(false);
    }, 300);
  }

  async function handleAddLabel(label: LabelResult) {
    setIsSubmitting(true);
    const result = await addManualLabelEvidence(setId, label.id);
    if (result.success) {
      setEvidence((prev) => [
        ...prev,
        {
          setId,
          labelId: label.id,
          evidenceType: "MANUAL",
          label: { id: label.id, name: label.name },
        },
      ]);
      setSearchQuery("");
      setSearchResults([]);
      setShowDropdown(false);
      setIsAdding(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add label");
    }
    setIsSubmitting(false);
  }

  async function handleRemoveLabel(labelId: string, evidenceType: string) {
    setIsSubmitting(true);
    const result = await removeLabelEvidence(setId, labelId, evidenceType);
    if (result.success) {
      setEvidence((prev) =>
        prev.filter((e) => !(e.labelId === labelId && e.evidenceType === evidenceType)),
      );
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to remove label");
    }
    setIsSubmitting(false);
  }

  return (
    <div className="space-y-2">
      {/* Evidence badges with remove */}
      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {evidence.map((ev) => (
            <Badge
              key={`${ev.setId}-${ev.labelId}-${ev.evidenceType}`}
              variant="outline"
              className={cn(
                "text-xs gap-1",
                ev.evidenceType === "CHANNEL_MAP"
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                  : "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400",
              )}
            >
              {ev.label.name}
              <span className="opacity-60">
                {ev.evidenceType === "CHANNEL_MAP" ? "channel" : "manual"}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="ml-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${ev.label.name}`}
                  >
                    <X size={10} />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove label evidence?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Remove &ldquo;{ev.label.name}&rdquo; ({ev.evidenceType === "CHANNEL_MAP" ? "channel map" : "manual"}) from this set?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleRemoveLabel(ev.labelId, ev.evidenceType)}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Badge>
          ))}
        </div>
      )}

      {/* Add label button / search */}
      {!isAdding ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus size={12} />
          Add Label
        </Button>
      ) : (
        <div className="relative max-w-xs" ref={dropdownRef}>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              placeholder="Search labels…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
              disabled={isSubmitting}
            />
            {isSearching && (
              <Loader2
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
              />
            )}
          </div>

          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/20 bg-card shadow-lg">
              <ul className="max-h-36 overflow-y-auto py-1">
                {searchResults.map((label) => (
                  <li key={label.id}>
                    <button
                      type="button"
                      onClick={() => handleAddLabel(label)}
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
                      disabled={isSubmitting}
                    >
                      {label.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => {
                setIsAdding(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
