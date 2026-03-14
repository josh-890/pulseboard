"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

function getFlagSrc(code: string): string {
  const minioUrl =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, string>).__MINIO_URL__
      : process.env.NEXT_PUBLIC_MINIO_URL;
  return `${minioUrl}/flags/${code.toLowerCase()}.svg`;
}

type FlagImageProps = {
  code: string;
  size?: number;
  className?: string;
};

export function FlagImage({ code, size = 24, className }: FlagImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted/60 text-[10px] font-medium text-muted-foreground uppercase",
          className,
        )}
        style={{ width: size, height: size }}
        title={code.toUpperCase()}
      >
        {code.toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getFlagSrc(code)}
      alt={`Flag of ${code.toUpperCase()}`}
      width={size}
      height={size}
      className={cn("inline-block rounded-full object-cover", className)}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
