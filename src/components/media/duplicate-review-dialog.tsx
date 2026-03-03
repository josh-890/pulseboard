"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Copy, Replace, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DuplicateMatch } from "@/lib/types";

type DuplicateReviewDialogProps = {
  open: boolean;
  uploadingFile: { name: string; preview: string; size: number };
  matches: DuplicateMatch[];
  onDecline: () => void;
  onAccept: () => void;
  onReplace: (mediaItemId: string) => void;
};

const SCOPE_LABELS: Record<DuplicateMatch["scope"], string> = {
  same_session: "Same session",
  same_person: "Same person",
  global: "Another person",
};

const SCOPE_COLORS: Record<DuplicateMatch["scope"], string> = {
  same_session: "text-red-400 bg-red-500/10 border-red-500/20",
  same_person: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  global: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DuplicateReviewDialog({
  open,
  uploadingFile,
  matches,
  onDecline,
  onAccept,
  onReplace,
}: DuplicateReviewDialogProps) {
  const [selectedMatch, setSelectedMatch] = useState<string>(
    matches[0]?.mediaItemId ?? "",
  );

  const primaryMatch = matches.find((m) => m.mediaItemId === selectedMatch) ?? matches[0];
  if (!primaryMatch) return null;

  const isSamePersonOrSession =
    primaryMatch.scope === "same_session" || primaryMatch.scope === "same_person";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDecline()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" />
            Duplicate Image Detected
          </DialogTitle>
        </DialogHeader>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Uploading */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Uploading
            </p>
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-muted/30">
              <Image
                src={uploadingFile.preview}
                alt="Uploading file"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p className="truncate font-medium text-foreground">
                {uploadingFile.name}
              </p>
              <p>{formatFileSize(uploadingFile.size)}</p>
            </div>
          </div>

          {/* Existing match */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Existing
            </p>
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-muted/30">
              {primaryMatch.thumbnailUrl ? (
                <Image
                  src={primaryMatch.thumbnailUrl}
                  alt="Existing match"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No preview
                </div>
              )}
            </div>
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p className="truncate font-medium text-foreground">
                {primaryMatch.filename}
              </p>
              {primaryMatch.personName && (
                <p>{primaryMatch.personName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Scope badge */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium w-fit",
            SCOPE_COLORS[primaryMatch.scope],
          )}
        >
          <span>
            {SCOPE_LABELS[primaryMatch.scope]}
            {primaryMatch.personName && ` \u00b7 ${primaryMatch.personName}`}
          </span>
        </div>

        {/* Multiple matches selector */}
        {matches.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {matches.length} matches found
            </p>
            <div className="flex flex-wrap gap-1.5">
              {matches.map((m) => (
                <button
                  key={m.mediaItemId}
                  type="button"
                  onClick={() => setSelectedMatch(m.mediaItemId)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs transition-all",
                    m.mediaItemId === selectedMatch
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {m.filename}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onDecline}>
            <X size={14} className="mr-1.5" />
            Decline
          </Button>
          <Button variant="outline" onClick={onAccept}>
            <Copy size={14} className="mr-1.5" />
            Keep both
          </Button>
          {isSamePersonOrSession && (
            <Button
              variant="default"
              onClick={() => onReplace(primaryMatch.mediaItemId)}
            >
              <Replace size={14} className="mr-1.5" />
              Replace existing
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
