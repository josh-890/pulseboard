// Reconstruct an interval (validFrom / validTo / active) from an event log.
// The earliest event supplies validFrom; if the chronologically-last event is
// a removal-style event, it supplies validTo and the entity is no longer
// active. ADR-0002 — events are the source of truth; the validFrom/validTo
// shape is preserved for UI consumers (see Phase D).

type EventLike = { date: Date | null; eventType: string };

const REMOVAL_TYPES = new Set(["removed", "ended", "RETIRED"]);

export function deriveInterval<E extends EventLike>(
  events: E[],
): { validFrom: Date | null; validTo: Date | null; active: boolean } {
  if (events.length === 0) {
    return { validFrom: null, validTo: null, active: true };
  }
  const sorted = [...events].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1; // dateless events sort first (open-ended start)
    if (!b.date) return 1;
    return a.date.getTime() - b.date.getTime();
  });
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const isRemoval = REMOVAL_TYPES.has(last.eventType);
  return {
    validFrom: first.date,
    validTo: isRemoval ? last.date : null,
    active: !isRemoval,
  };
}
