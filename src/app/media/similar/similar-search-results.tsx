"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimilarMatch } from "@/lib/types";

type SourceInfo = {
  mediaItemId: string;
  filename: string;
  thumbnailUrl: string;
  originalWidth: number;
  originalHeight: number;
};

type SimilarSearchResultsProps = {
  source: SourceInfo;
  matches: SimilarMatch[];
};

function similarityPercent(distance: number): number {
  return Math.round(((64 - distance) / 64) * 100);
}

function similarityColor(distance: number): string {
  const pct = similarityPercent(distance);
  if (pct >= 90) return "text-emerald-400 bg-emerald-500/10";
  if (pct >= 80) return "text-amber-400 bg-amber-500/10";
  return "text-blue-400 bg-blue-500/10";
}

export function SimilarSearchResults({
  source,
  matches,
}: SimilarSearchResultsProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-full bg-card/50 p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-semibold">Find Similar Images</h1>
          <p className="text-sm text-muted-foreground">
            Visually similar images based on perceptual hashing
          </p>
        </div>
      </div>

      {/* Source image hero */}
      <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-card/50 p-4 backdrop-blur-sm">
        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-muted/30">
          {source.thumbnailUrl ? (
            <Image
              src={source.thumbnailUrl}
              alt={source.filename}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Search size={24} />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-medium">{source.filename}</p>
          <p className="text-sm text-muted-foreground">
            {source.originalWidth} x {source.originalHeight}
          </p>
          <p className="text-sm text-muted-foreground">
            {matches.length} similar image{matches.length !== 1 ? "s" : ""} found
          </p>
        </div>
      </div>

      {/* Results grid */}
      {matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-card/50 p-12 backdrop-blur-sm">
          <Search size={32} className="text-muted-foreground/50" />
          <p className="text-muted-foreground">
            No similar images found
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {matches.map((match) => (
            <Link
              key={match.mediaItemId}
              href={`/media/similar?id=${match.mediaItemId}`}
              className="group space-y-2"
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-all group-hover:border-primary/50 group-hover:ring-1 group-hover:ring-primary/30">
                {match.thumbnailUrl ? (
                  <Image
                    src={match.thumbnailUrl}
                    alt={match.filename}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No preview
                  </div>
                )}

                {/* Similarity badge */}
                <div
                  className={cn(
                    "absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                    similarityColor(match.distance),
                  )}
                >
                  {similarityPercent(match.distance)}%
                </div>
              </div>

              <div className="space-y-0.5 px-0.5">
                <p className="truncate text-xs font-medium text-foreground/80">
                  {match.filename}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {match.originalWidth} x {match.originalHeight}
                  {match.personName && ` \u00b7 ${match.personName}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
