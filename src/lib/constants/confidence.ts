import type { ParticipationConfidence, ConfidenceSource } from "@/generated/prisma/client";

export const CONFIDENCE_RANK: Record<ParticipationConfidence, number> = {
  CONFIRMED: 3,
  PROBABLE: 2,
  POSSIBLE: 1,
};

export const CONFIDENCE_LABELS: Record<ParticipationConfidence, string> = {
  CONFIRMED: "Confirmed",
  PROBABLE: "Probable",
  POSSIBLE: "Possible",
};

export const CONFIDENCE_STYLES: Record<
  ParticipationConfidence,
  { bg: string; text: string; ring: string }
> = {
  CONFIRMED: {
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    ring: "ring-emerald-500",
  },
  PROBABLE: {
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    ring: "ring-amber-500",
  },
  POSSIBLE: {
    bg: "bg-zinc-500/20",
    text: "text-zinc-400",
    ring: "ring-zinc-500",
  },
};

export const CONFIDENCE_SOURCE_LABELS: Record<ConfidenceSource, string> = {
  MANUAL: "Manual",
  CREDIT_MATCH: "Credit Match",
  IMPORT: "Import",
};
