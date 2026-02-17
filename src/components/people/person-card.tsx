"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { PersonBrowserItem } from "@/lib/types";
import type { DensityMode } from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";

type PersonCardProps = {
  person: PersonBrowserItem;
  density: DensityMode;
};

const densityConfig = {
  comfortable: {
    card: "h-[136px]",
    imageW: "w-[100px]",
    padding: "p-3",
    name: "text-base",
    meta: "text-sm",
    metaLines: 2,
  },
  compact: {
    card: "h-[100px]",
    imageW: "w-[76px]",
    padding: "p-2",
    name: "text-sm",
    meta: "text-xs",
    metaLines: 1,
  },
} as const;

function MetaSeparator() {
  return <span className="mx-1.5 text-muted-foreground/50">&middot;</span>;
}

function formatBirthdate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PersonCard({ person, density }: PersonCardProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const config = densityConfig[density];
  const initials = `${person.firstName[0]}${person.lastName[0]}`;
  const showImage = person.photoUrl && !imgError;

  // Build metadata line 1: jobTitle · department
  const line1Parts: string[] = [];
  if (person.jobTitle) line1Parts.push(person.jobTitle);
  if (person.department) line1Parts.push(person.department);

  // Build metadata line 2: birthdate · email (comfortable only)
  const line2Parts: string[] = [];
  if (person.birthdate) line2Parts.push(formatBirthdate(person.birthdate));
  if (person.email) line2Parts.push(person.email);

  function handleClick() {
    router.push(`/people/${person.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(`/people/${person.id}`);
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex cursor-pointer overflow-hidden rounded-xl border border-white/30 bg-card/70 shadow-lg backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10",
        config.card,
      )}
    >
      {/* 4:5 aspect image / fallback */}
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-l-xl",
          config.imageW,
        )}
        style={{ backgroundColor: showImage ? undefined : person.avatarColor }}
      >
        {showImage ? (
          <Image
            src={person.photoUrl!}
            alt={`${person.firstName} ${person.lastName}`}
            fill
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-lg font-semibold text-white">
            {initials}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center",
          config.padding,
        )}
      >
        <h3
          className={cn(
            "truncate font-semibold leading-tight group-hover:text-primary",
            config.name,
          )}
        >
          {person.firstName} {person.lastName}
        </h3>

        {line1Parts.length > 0 && (
          <p
            className={cn(
              "mt-0.5 truncate text-muted-foreground",
              config.meta,
            )}
          >
            {line1Parts.map((part, i) => (
              <span key={i}>
                {i > 0 && <MetaSeparator />}
                {part}
              </span>
            ))}
          </p>
        )}

        {config.metaLines >= 2 && line2Parts.length > 0 && (
          <p
            className={cn(
              "mt-0.5 truncate text-muted-foreground",
              config.meta,
            )}
          >
            {line2Parts.map((part, i) => (
              <span key={i}>
                {i > 0 && <MetaSeparator />}
                {part}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
