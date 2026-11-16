/**
 * Who an image shows (ADR-0023, support 2026-10-24) — one rule for the server,
 * the galleries and the filters:
 *
 *     shown(image) = (leads(session) \ hidden(image)) ∪ (support(session) ∩ shownSupport(image))
 *
 * A lead (Model) is shown unless hidden on the image; someone only appearing
 * (support) only where marked as shown. Pure, so client and server share it.
 *
 * Focus (ADR-0039, 2026-11-17) — who the image is about, for the curated views
 * (a person's showcase); "shown" stays the fact for filters and galleries:
 *
 *     focus(image) = (shown leads \ background(image)) ∪ (shown support ∩ focusSupport(image))
 *
 * A lead is the focus unless marked as only in the shot; someone appearing only
 * where marked as the focus.
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
  /** Leads in the shot of this image, but not its focus */
  backgroundPersonIds?: string[];
  /** Support marked as the focus of this image (a subset of shownSupportIds) */
  focusSupportIds?: string[];
};

/** Bulk "people shown" across selected images: hide, show, show as the focus, show only in the shot */
export type BulkShownMode = "hide" | "show" | "focus" | "background";

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

/** Who the image is about — the shown people minus those only in the shot */
export function imageFocusIds(item: ShownSource): string[] {
  const background = new Set(item.backgroundPersonIds ?? []);
  const focusSupport = new Set(item.focusSupportIds ?? []);
  const lead = new Set(item.sessionCastIds ?? []);
  return imageShownIds(item).filter((id) => (lead.has(id) ? !background.has(id) : focusSupport.has(id)));
}

export function imageFocuses(item: ShownSource, personId: string): boolean {
  return imageFocusIds(item).includes(personId);
}

/** Shown people only in the shot (not the focus), in shown order */
export function imageBackgroundIds(item: ShownSource): string[] {
  const focus = new Set(imageFocusIds(item));
  return imageShownIds(item).filter((id) => !focus.has(id));
}

const without = (ids: string[] | undefined, id: string) => (ids ?? []).filter((x) => x !== id);
const withId = (ids: string[] | undefined, id: string) => [...new Set([...(ids ?? []), id])];

/**
 * A bulk "people shown" change on one image, as the server applies it
 * (`bulkHidePersons` / `bulkShowPersons` / `bulkSetFocus`) — for the galleries'
 * optimistic update. A lead is someone in the session's lead cast; support marks
 * apply only to someone appearing in that session.
 */
export function applyBulkShown<T extends ShownSource>(item: T, personId: string, mode: BulkShownMode): T {
  const lead = (item.sessionCastIds ?? []).includes(personId);
  const support = !lead && (item.supportCastIds ?? []).includes(personId);
  if (mode === "hide") {
    return {
      ...item,
      hiddenPersonIds: withId(item.hiddenPersonIds, personId),
      shownSupportIds: without(item.shownSupportIds, personId),
      focusSupportIds: without(item.focusSupportIds, personId),
      backgroundPersonIds: without(item.backgroundPersonIds, personId),
    };
  }
  const next: T = { ...item, hiddenPersonIds: without(item.hiddenPersonIds, personId) };
  if (support) next.shownSupportIds = withId(item.shownSupportIds, personId);
  if (mode === "focus") {
    next.backgroundPersonIds = without(item.backgroundPersonIds, personId);
    if (support) next.focusSupportIds = withId(item.focusSupportIds, personId);
  } else if (mode === "background") {
    if (lead) next.backgroundPersonIds = withId(item.backgroundPersonIds, personId);
    if (support) next.focusSupportIds = without(item.focusSupportIds, personId);
  }
  return next;
}
