/**
 * Who an image shows (ADR-0023, support 2026-10-24) — one rule for the server,
 * the galleries and the filters:
 *
 *     shown(image) = (leads(session) \ hidden(image)) ∪ (support(session) ∩ shownSupport(image))
 *
 * A lead (Model) is shown unless hidden on the image; someone only appearing
 * (support) only where marked as shown. Pure, so client and server share it.
 */

export type ShownSource = {
  /** The session's lead cast */
  sessionCastIds?: string[];
  /** Leads hidden on this image */
  hiddenPersonIds?: string[];
  /** The session's support cast */
  supportCastIds?: string[];
  /** Support marked as shown on this image */
  shownSupportIds?: string[];
};

/** Who the image shows — leads first, then support, each in cast order */
export function imageShownIds(item: ShownSource): string[] {
  const hidden = new Set(item.hiddenPersonIds ?? []);
  const shownSupport = new Set(item.shownSupportIds ?? []);
  const leads = (item.sessionCastIds ?? []).filter((id) => !hidden.has(id));
  const lead = new Set(item.sessionCastIds ?? []);
  const support = (item.supportCastIds ?? []).filter((id) => !lead.has(id) && shownSupport.has(id));
  return [...leads, ...support];
}

export function imageShows(item: ShownSource, personId: string): boolean {
  return imageShownIds(item).includes(personId);
}
