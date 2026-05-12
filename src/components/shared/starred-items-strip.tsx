"use client";

import Image from "next/image";
import Link from "next/link";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StarredItem = {
  id: string;
  href: string;
  photo?: { thumbUrl: string; focalX?: number | null; focalY?: number | null };
  label: string;
  sublabel?: string;
};

type StarredItemsStripProps = {
  items: StarredItem[];
  onUnstar: (id: string) => void;
  aspectRatio?: "2/3" | "4/3" | "1/1";
  className?: string;
};

export function StarredItemsStrip({
  items,
  onUnstar,
  aspectRatio = "2/3",
  className,
}: StarredItemsStripProps) {
  if (items.length === 0) return null;

  const cardWidth = aspectRatio === "2/3" ? 72 : aspectRatio === "4/3" ? 112 : 90;
  const aspectClass = aspectRatio === "2/3" ? "aspect-[2/3]" : aspectRatio === "4/3" ? "aspect-[4/3]" : "aspect-square";

  return (
    <div className={cn("mb-5", className)}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          Starred ({items.length})
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1.5">
        {items.map((item) => (
          <div key={item.id} className="group relative shrink-0" style={{ width: cardWidth }}>
            <Link href={item.href} prefetch={false} className="block">
              <div
                className={cn(
                  "overflow-hidden rounded-lg bg-muted/50 mb-1 relative",
                  aspectClass,
                )}
              >
                {item.photo ? (
                  <Image
                    src={item.photo.thumbUrl}
                    alt={item.label}
                    fill
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                    style={{
                      objectPosition:
                        item.photo.focalX != null && item.photo.focalY != null
                          ? `${(item.photo.focalX * 100).toFixed(1)}% ${(item.photo.focalY * 100).toFixed(1)}%`
                          : "center",
                    }}
                    unoptimized
                    sizes={`${cardWidth}px`}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                    <Star size={14} />
                  </div>
                )}
              </div>
              <p className="text-[11px] font-medium truncate leading-tight">{item.label}</p>
              {item.sublabel && (
                <p className="text-[10px] text-muted-foreground/70 truncate">{item.sublabel}</p>
              )}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUnstar(item.id);
              }}
              className="absolute top-0.5 right-0.5 size-4 flex items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
              aria-label="Unstar"
            >
              <X size={8} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
