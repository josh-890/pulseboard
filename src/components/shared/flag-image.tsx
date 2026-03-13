"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

type FlagImageProps = {
  code: string;
  size?: number;
  className?: string;
};

export function FlagImage({ code, size = 24, className }: FlagImageProps) {
  const lowerCode = code.toLowerCase();
  const [src, setSrc] = useState(`/flags/${lowerCode}.svg`);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);

  const handleError = useCallback(() => {
    if (retried) {
      setFailed(true);
      return;
    }
    // Trigger the caching API route, then retry with the static path
    setRetried(true);
    setSrc(`/api/flags/${lowerCode}`);
  }, [lowerCode, retried]);

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
      src={src}
      alt={`Flag of ${code.toUpperCase()}`}
      width={size}
      height={size}
      className={cn("inline-block rounded-full object-cover", className)}
      style={{ width: size, height: size }}
      onError={handleError}
    />
  );
}
