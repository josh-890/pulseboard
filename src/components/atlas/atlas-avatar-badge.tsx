import Image from "next/image";
import { UserRound } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import type { AtlasTile } from "@/lib/services/atlas-service";

export type AvatarCorner = "tl" | "tr" | "bl" | "br";

export const AVATAR_CORNERS: AvatarCorner[] = ["tl", "tr", "bl", "br"];

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
  size: "tile" | "lightbox";
};

// Whose image this is, at a glance — an aligned crop of eyes or a pose says
// nothing about the person once you page across people.
export function AtlasAvatarBadge({ avatar, personName, corner, size }: AtlasAvatarBadgeProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10",
        CORNER_CLASS[corner],
        size === "tile" ? "m-1.5 h-9 w-9" : "m-4 h-20 w-20 sm:m-6",
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
            <UserRound size={size === "tile" ? 16 : 32} className="text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
