"use client";

import Image from "next/image";
import { Camera, Film } from "lucide-react";

// Minimal hover preview for a timeline row's cover. Renders just an
// enlarged version of the cover image. The row already shows title,
// status, archive state, rating, and participants — the popover only
// adds visual confirmation (a bigger image). Clicking the row
// navigates to the set; no link pill is needed in the popover.
//
// Triggered by hovering the SMALL cover thumbnail on the row (not the
// whole row), keeping the affordance precise: "I want to see this
// image bigger" → hand goes to the cover, popover appears next to it.

export type SetHoverPreviewProps = {
  coverUrl: string | null;
  isVideo: boolean;
};

const PHOTO_W = 240;
const PHOTO_H = 320;
const VIDEO_W = 480;
const VIDEO_H = 270;

export function SetHoverPreview({ coverUrl, isVideo }: SetHoverPreviewProps) {
  const w = isVideo ? VIDEO_W : PHOTO_W;
  const h = isVideo ? VIDEO_H : PHOTO_H;
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/15 bg-popover shadow-2xl"
      style={{ width: w, height: h }}
    >
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt=""
          fill
          className="object-cover"
          unoptimized
          sizes={`${w}px`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          {isVideo ? <Film size={64} /> : <Camera size={64} />}
        </div>
      )}
    </div>
  );
}

export const SET_HOVER_PREVIEW_DIMS = {
  photo: { width: PHOTO_W, height: PHOTO_H },
  video: { width: VIDEO_W, height: VIDEO_H },
} as const;
