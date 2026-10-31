import Image from "next/image";
import { UserRound } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import type { AtlasTile } from "@/lib/services/atlas-service";

export type AvatarCorner = "tl" | "tr" | "bl" | "br";

export const AVATAR_CORNERS: AvatarCorner[] = ["tl", "tr", "bl", "br"];

export type AvatarSize = "s" | "m" | "l";

export const AVATAR_SIZES: AvatarSize[] = ["s", "m", "l"];

// One choice for both places: tile 36 / 56 / 80 px, lightbox 80 / 128 / 192 px
const SIZE_CLASS: Record<"tile" | "lightbox", Record<AvatarSize, string>> = {
  tile: { s: "h-9 w-9", m: "h-14 w-14", l: "h-20 w-20" },
  lightbox: { s: "h-20 w-20", m: "h-32 w-32", l: "h-48 w-48" },
};

const CORNER_CLASS: Record<AvatarCorner, string> = {
  tl: "left-0 top-0",
  tr: "right-0 top-0",
  bl: "bottom-0 left-0",
  br: "bottom-0 right-0",
};

type AtlasAvatarBadgeProps = {
  avatar: AtlasTile["avatar"];
  personName: string;
  corner: AvatarCorner;
  size: AvatarSize;
  place: "tile" | "lightbox";
};

// Whose image this is, at a glance — an aligned crop of eyes or a pose says
// nothing about the person once you page across people.
export function AtlasAvatarBadge({ avatar, personName, corner, size, place }: AtlasAvatarBadgeProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10",
        CORNER_CLASS[corner],
        place === "tile" ? "m-1.5" : "m-4 sm:m-6",
        SIZE_CLASS[place][size],
      )}
      title={personName}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full border-2 border-white/80 bg-muted shadow-lg shadow-black/40">
        {avatar ? (
          <Image
            src={avatar.url}
            alt={personName}
            fill
            unoptimized
            className="object-cover"
            style={focalStyle(avatar.focalX, avatar.focalY)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UserRound size={place === "tile" ? 16 : 32} className="text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
