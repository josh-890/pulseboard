// Per-set "credited as" resolution (ADR-0024).
//
// A Set displays the alias a person appeared under as evidence, never as the
// source of truth. Precedence:
//   (1) the pinned alias (`SetCreditRaw.resolvedAlias`) — reads its CURRENT name,
//       so a rename propagates; suppressed when it equals the common name.
//   (2) else the frozen raw string (`SetCreditRaw.rawName`) when it differs from
//       the common name — shown even before the alias is promoted into the registry.
//   (3) else nothing.
//
// The channel↔alias mapping is a suggestion engine only — it is NEVER consulted
// here, so a set never asserts an alias it has no evidence for.

export type CreditedAsInput = {
  rawName: string | null;
  resolvedAlias: { name: string } | null;
};

export function resolveCreditedAs(
  credit: CreditedAsInput,
  commonName: string | null,
): string | null {
  // (1) Pinned alias is authoritative. If it equals the common name, the set is
  // credited under the common name — show nothing (do not fall through to raw).
  if (credit.resolvedAlias) {
    const pinned = credit.resolvedAlias.name;
    return pinned && pinned !== commonName ? pinned : null;
  }
  // (2) Frozen raw string as evidence, even pre-promotion.
  if (credit.rawName && credit.rawName !== commonName) return credit.rawName;
  // (3) Nothing to show.
  return null;
}
