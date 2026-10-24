# ADR-0037: The support role "Appearance" — on camera, only appearing

- **Status:** Accepted
- **Date:** 2026-10-24
- **Relates to:** ADR-0021 (behind-camera credits), ADR-0023 (who an image shows), ADR-0036 (intensity)

## Context

A session's on-camera cast had one role, *Model*. Some people are in a shoot without being what it is about:
they appear briefly, in the background, or as a partner in a few frames. Credited as Model they count everywhere
a model counts: the intensity panel, the person's career and "Sets" count, Known-for and the showcase, set cards,
person filters, and every image of the session. The user wanted them in the session and the set, but filterable,
without intensity, and not shown on images unless they really are.

"On camera" was also decided by a name: `group.name !== "Behind Camera"`, in about 30 places. Renaming the group
would have flipped every one of them.

Comparable products: Spotify and Discogs list a separate "Appears on" next to an artist's own releases. IMDb has
cameo and uncredited roles and keeps them out of "Known for".

## Decision

1. **A second role in the existing On-Camera group.** *Appearance* (`crd_appearance`, slug `appearance`) sits
   beside *Model*. Every role carries a **presence**, `LEAD | SUPPORT` (`ContributionRoleDefinition.presence`,
   default LEAD). Model is LEAD; Appearance is SUPPORT. We rejected a separate role group (it would put "on camera"
   back behind a name check) and a flag on the contribution (a role is what the user picks; one place to say it).
2. **Hardening.** A role group has a fixed **kind**, `ON_CAMERA | BEHIND_CAMERA` (`ContributionRoleGroup.kind`, set
   from the old name by the migration). Code reads the kind and presence through the fragments in
   `session-contributors.ts`: `ON_CAMERA_ROLE`, `BEHIND_CAMERA_ROLE`, `LEAD_ROLE`, `SUPPORT_ROLE` in Prisma, and
   `rg.kind = 'ON_CAMERA'` / `rd.presence = 'LEAD'` in SQL. Renaming a group no longer changes behaviour.
3. **No intensity.** The intensity panel, a person's intensity and peak, the scenario suggestion and a set's
   intensity count leads only. Switching a contribution to a SUPPORT role removes its acts and extras in the same
   transaction. The role menu asks first when acts would go (`setContributionRole`).
4. **Images.** The ADR-0023 rule becomes
   `shown = (leads \ hidden) ∪ (support ∩ shownSupport) ∪ linked`. Someone only appearing is shown only where a
   `media_item_shown_person` row says so (the opposite of `media_item_hidden_person`). The rule exists once in
   TS (`imageShownIds`, `src/lib/image-shown.ts`) and once in SQL (`imageShows`, tag-predicates). Bulk "show"
   marks support only where they are support in the image's session. Bulk "hide" also clears the marks.
5. **Person.** The career lists their sets under **Appears in**, apart from the timeline
   (`getCareerTimeline(…, { presence: "SUPPORT" })`; staged sets are imports, always Model). These sets do not
   count in the "Sets" and photo KPIs, the career badge, label affiliations, Known-for or the showcase.
6. **Display.** On set and session cards support comes after the models, smaller and dimmed. On detail pages it
   sits under **Appearing** in the cast rail, with the contributor list leads first. A set's cast-size filter
   counts leads.
7. **Filters.** `person:ICG-ID` means the leads. **`cast:ICG-ID`** includes support (images: shown by the rule
   above). The /sets and /sessions person filter has an **incl. appearing** toggle (`personSupport=true`).
8. **Imports stay Model.** Credits from imports resolve to Model as before. Appearance is chosen by hand.

## Consequences

- Existing data does not change: every role is LEAD until someone is switched to Appearance.
- `mv_person_affiliations` still counts every participant. Nothing reads it; left as is.
- A future on-camera role (e.g. "Body double") is a row with a presence, not code.
