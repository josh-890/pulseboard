"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type PersonAvatarProps = {
  firstName: string;
  lastName: string;
  avatarColor: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

const imageSizes = {
  sm: 32,
  md: 40,
  lg: 64,
};

export function PersonAvatar({
  firstName,
  lastName,
  avatarColor,
  photoUrl,
  size = "md",
}: PersonAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = `${firstName[0]}${lastName[0]}`;
  const showImage = photoUrl && !imgError;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        sizeClasses[size],
      )}
      style={{ backgroundColor: showImage ? undefined : avatarColor }}
    >
      {showImage ? (
        <Image
          src={photoUrl}
          alt={`${firstName} ${lastName}`}
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
          unoptimized
        />
      ) : (
        initials
      )}
    </div>
  );
}
