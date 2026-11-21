import { cn } from "@/lib/utils";
import { cropStyle, type Crop } from "@/lib/tag-example";

export type TagExampleImageProps = { url: string; crop: Crop; className?: string };

/**
 * An example crop in a box of the tile's shape (ADR-0042, S4). The box sets the
 * shape (an `aspect-*` class); the image is placed so the crop fills it.
 */
export function TagExampleImage({ url, crop, className }: TagExampleImageProps) {
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- MinIO URL */}
      <img src={url} alt="" loading="lazy" draggable={false} className="absolute max-w-none" style={cropStyle(crop)} />
    </span>
  );
}
