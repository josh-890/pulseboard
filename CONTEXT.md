# Pulseboard

Pulseboard tracks people in art/creative production — their profiles, work history, inter-personal connections, and how their attributes develop over time.

## Language

### People & temporal model

**Person**:
The real human being. Owns only **core identity fields** that are structurally wired into the rest of the system — date of birth (the temporal floor, used by every age computation and as the fold's baseline anchor) and system identifiers. All other attributes — eye color, height, hair color, weight, build, body marks, etc. — live in the catalog-driven changing-attribute system regardless of how often they actually change.
_Avoid_: model, talent, subject (when the Person entity is meant).
_Migration in flight_: `Person.eyeColor` and `Person.height` are slated to move off the Person row into the delta spine — they were modeled as static columns historically but conceptually belong in the catalog. The schema still carries them as columns today.

**Era** (code model & DB table: `Era`):
A **phase** of a Person's development. Eras are **emergent**, not pre-planned — the user records changes first, and Eras are named retrospectively as labels for clusters of related changes ("2019 — went blonde, added sleeve tattoo"). Two states:
- **Draft** — auto-assigned by the system from incoming deltas (clustered by date proximity). Membership is **non-sticky**: editing a delta's date may re-cluster it into a different draft Era.
- **Curated** — the user has named it (promoting a draft, or creating one explicitly). Membership is **sticky**: editing a delta's date does not move it out of a curated Era.

An Era's temporal extent is the auto-derived range of its members' dates, so Eras *can overlap*; overlap is allowed but flagged for manual tidy-up. Eras form the sequence shown on the Person's development timeline.
_Avoid_: "Persona" (the legacy code-model name — fully replaced in May 2026); "change-point" (an Era is a span, not a single instant).
_Synonym_: Phase.

**Draft era** (revised 2026-05-23):
An Era auto-created from one or more deltas (record-a-change, quick edit, import) and not yet named/curated. Differs from a curated Era in two ways: (1) no user-given name, and (2) **non-sticky** membership — date corrections on its deltas re-cluster freely. Promotion to a curated Era happens when the user names it; from that moment sticky membership applies.

**Baseline**:
The first Era for a Person — "time zero". It holds the **starting value of every changing attribute** (the values formerly called "natural" hair color, breast size, etc.); the fold begins here. Exactly one per Person, auto-created, cannot be deleted. It carries **no date of its own** — it is always folded first by virtue of being the baseline; wherever a concrete date is needed (timeline edge, point-in-time fold) the Person's birthdate is used. `Person` itself carries only truly-static attributes (date of birth, eye color, height).

Baseline values are **best-guess**, not verified. Import-fed observations land on baseline by default — accepting the risk of mis-attribution for persons who have changed since the source observation, in exchange for a populated profile. Mis-attribution is corrected by **manual curation** when the user notices. The one exception is the **source-explicit-status** carve-out: when the import file itself signals a non-natural state (e.g. `breastDescription="enhanced or fake"`), the value does *not* go to baseline — it routes to a separate undated-changes Era with the appropriate `cause`. If no separate natural value is available in that case, baseline simply has no entry for that attribute and is surfaced as **unknown** so the gap can be searched and filled later. See ADR-0008.

**Static attribute** (revised 2026-05-23):
Static-ness is a **policy on the attribute definition**, not a storage location. Every catalog attribute carries a **mutability policy** that drives its UI and validation: a "never changes" attribute (eye color) is shown with inline edit and warns if a second value is filed; a "volatile" attribute (weight) leads with the record-a-change affordance. Storage is uniform across all of them — one delta stream, with truly-static values stored as a single delta at Baseline. The only fields exempt are the **core identity fields** on **Person** itself (date of birth, system identifiers), which exist for *system* reasons, not because they "don't change much".

**Mutability policy** (added 2026-05-23):
Three levels, attached to each scalar attribute definition. Drives UI affordance + validation only — never modifies stored history. Reclassification (e.g. `RARELY_CHANGES → VOLATILE`) takes effect immediately for new authoring and leaves existing deltas untouched.
- `ALWAYS_STATIC` — UI: inline edit only, no record-a-change affordance. Validation: soft warning if a second non-baseline delta is filed. *Examples: handedness, eye color, Brushfield spots.*
- `RARELY_CHANGES` — UI: inline edit plus record-a-change in a secondary menu. No validation warnings. *Examples: build, face shape, inseam, hair pattern.*
- `VOLATILE` — UI: record-a-change is the primary affordance; current value plus trend shown alongside. No validation warnings. *Examples: weight, hair color, hair length, body fat.*

**Changing attribute**:
A Person attribute that develops over time. Two kinds:
- **Identity-bearing** — a specific object you edit over its lifetime (a particular tattoo, piercing, skill). Modelled as a persistent parent record plus an **Event** log.
- **Identity-less (scalar)** — a value that simply differs over time, with no object identity of its own (weight, hair color, build). Modelled as **scalar deltas**, each targeting an **Attribute definition**.

**Delta**:
A single, independently-dated recorded change to one changing attribute, relative to the state immediately before it. Every delta — whether an **Event** on an identity-bearing attribute or a **scalar delta** — has the uniform shape *(Era, what it targets, value, its own date)*. The current state of a Person is the **fold** of the Baseline plus every delta in chronological order. In the UI a delta is surfaced to the user as a **Change** ("Tattoo added", "Hair → Blonde").

**Event**:
One delta in the lifecycle of an identity-bearing changing attribute (`added` / `modified` / `removed`). Whether the attribute is present *now* is derived from its last Event by date — there are no separate validity-interval fields.

**Attribute definition**:
A catalog entry (admin-configurable) describing one trackable scalar attribute — its name, value type (numeric, single-select, etc.), unit, and allowed values. Every scalar delta targets an Attribute definition; the catalog is the single registry of what scalar attributes exist.

**Attribute status** (revised 2026-06-19, ADR-0018):
A *derived* property of a changing attribute — `NATURAL`, `ENHANCED`, `REDUCED`, or `RESTORED`. Derived from the **change-kind** stored per delta in `cause` (`NATURAL` / `AUGMENTATION` / `REDUCTION` / `REVERSAL` / `OTHER`; legacy `SURGICAL` survives for body events) via the Fold:
- `NATURAL` — no surgical-kind delta in the attribute's history.
- `ENHANCED` — the winning delta is `AUGMENTATION` (or legacy `SURGICAL`).
- `REDUCED` — the winning delta is `REDUCTION`.
- `RESTORED` — the winning delta is `REVERSAL` (explant), or a surgical kind exists in history but a later natural delta overrode it.

Change-kind is a **per-attribute** property (PROV/CQRS/EMR: semantics belong on the specific change, not the change-set). It is authored via an **inline "Kind" picker** on the status-bearing field (breast size), never a change-set-wide control, and applies only to that delta — never bled onto unrelated attributes.

Cached per attribute in `PersonCurrentState.attributeStatuses` for query (filter: "all persons with reduced breast status"). Hero/grid display: `NATURAL` renders as plain value; the others render as `B (Natural) → D (Enhanced)` / `D (Natural) → B (Reduced)` with a status label per value pill.

**Status is gated by `PhysicalAttributeDefinition.statusBearing`** (Boolean, default `FALSE`). The status vocabulary only makes semantic sense for attributes that can be surgically altered (breast size; potentially face attrs). For non-status-bearing attrs (weight, hair color, build, all body measurements, etc.) the UI surfaces — Pattern Y, status sub-filter in the sidebar, the inline Kind picker — are hidden. The `cause` column on `ScalarDelta` and the fold-derived `attributeStatuses` cache column remain populated uniformly; gating is a UI/UX policy, not a data constraint (same pattern as `mutability` per ADR-0005). See `docs/adr/0007` + `docs/adr/0018` and `project_status_bearing_eligibility.md`.

_Historical note_: until 2026-05-24, status was derived from the presence of a `CosmeticProcedure` record targeting the attribute. ADR-0007 dropped the `CosmeticProcedure` entity and moved causation onto the delta itself.

**Fold**:
The computation that replays Baseline + every delta — gathered across all Eras and **sorted by each delta's own date**, ignoring Era boundaries — to produce a Person's **current state** (or their state at any chosen point in time, via an `asOf` cut-off).

**Current state**:
The result of the Fold as of *now* — a Person's present hair color, weight, active body marks, etc. It is a derived value, never authored directly; it is served from a per-person cache kept correct within each mutation's transaction.

**Era-linked participation**:
A person's participation in a shoot (`SessionContribution`) optionally references the **Era** the person was in at that time. This anchors their *appearance at the shoot* — the Fold computed `asOf` that Era — and lets an Era list the sessions and sets that occurred during it.

### Production & publication (added 2026-06-23)

The ladder runs **Channel → Label → Network**, and it separates **production** (where media is *generated*) from **publication** (where media is *released*). The pivot fact: **a Session produces; a Set publishes.**

**Session** (code model & DB table: `Session`):
The **production unit** — one shoot, a point in space and time, which *owns* the media generated there. Production-level. Ties to its producing **Label** via `Session.labelId`. A session's media can be published many different ways (see **Set**). A session published through a channel *outside* its producing label is a **co-production** (it then belongs to more than one Label — e.g. a photographer shoots under his own label, later sells publication rights to another label's channel).

**Set** (code model & DB table: `Set`):
A **publication** — a *packaged subset* of a Session's media, released via **one Channel** on a publication date. **Publication-level, not production-level.** One Session → many Sets: different subsets on different dates, subsets via different channels of the same label, or *the same subset* via different channels. Carries its publication Channel as a hard FK (`Set.channelId`). Because the underlying media is owned by the Session, two Sets publishing the same subset are two *publications* of **one** body of production media — not duplicated media.
_Avoid_: treating a Set as the production object (that is the Session); equating "two channel releases of the same shoot" with "two productions".

**Channel** (code model & DB table: `Channel`):
A **publication frontend** — the distribution site/imprint a Set is *released through*, named at the source platform's granularity (HANDSONHARDCORE, DDFBusty). Fine-grained, **publication truth**, and the only attribution that comes free from import files. Crucially it is **the one hard, leaf-resolvable signal**: coming up from the published media, the Channel is the *first* thing known (the first entry and first sort key). One Channel is *part of* one Label.
_Avoid_: "label"/"studio"/"producer" (those are the Label) — a Channel is a storefront, not a maker.

**Label** (code model & DB table: `Label`):
The **production entity** — the studio/brand whose Sessions generate the media (DDF), grouping the Channels it publishes through. **Emergent, like an Era**: a brand-new Channel **spawns a stub Label** (1:1, provisional — the analogue of a *draft* Era), and channel↔label groupings are **discovered over time**; consolidating several Channels under one Label is the analogue of **promoting a draft Era to a curated one**. This single mechanism covers both "new channel = its own umbrella" (early) and "many channels = one umbrella" (mature).
_Avoid_: "channel" (that is the publication frontend); "network" (the tier above).

**Network** (code model & DB table: `Network`):
A grouping **above Labels** — a parent running several topic-specialised Labels, or a collaboration between Labels. Pure grouping for browsing/affiliation.

**Evidence vs. hard link** (production attribution is soft, with one denormalized owner):
Publication is hard-wired onto the Set (`Set.channelId`); **production grouping is softer**. A Channel's **owning Label** is the denormalized FK **`Channel.labelId`** (ADR-0020) — the deterministic owner used by archive matching, dedup, and the set-merge guard. Behind it, `ChannelLabelMap` (M:N, `confidence`) is the full channel↔label association table (owner row at conf 1.0 + any secondary/cross-label evidence); Set↔Label is `SetLabelEvidence` (M:N, `confidence`, `EvidenceType`); the only *hard* production link is `Session.labelId`. There is no hard `Set.labelId` — a Set's producing Label is reached via its Channel's owner FK or its Session.

### Imagery & alignment (added 2026-06-12)

**Alignment Template** (concept; code model & DB table: `MotifTemplate`):
A geometric recipe for standardised framing — target **keypoints** (frame fractions 0..1) + output aspect + bake long side (+ optional silhouette guide). Applied post-hoc: the user clicks the keypoints on a source photo, a Umeyama 2D similarity transform maps them to the targets, and the result is baked. Its sole job is **comparability** — make every image framed against it share the same visual impression. Generalises the original Motif/headshot mechanism. Binds to a **MediaCategory** (0:1). See ADR-0014.
_Historical note_: born as "Motif Template" tied to a profile `slot @unique`; the slot weld is retired and the recipe generalised to any locus category.

**Aligned image**:
A **baked pixel copy** (a `MediaItem` in the person's reference session) produced by applying an Alignment Template to a **source image**. A derived copy with decoupled identity that **retains provenance** (`sourceMediaItemId` + template + transform matrix) — re-bakeable and staleness-detectable, never an orphan and never a render-time transform. Identified by its alignment-template binding + provenance. Visibility is derived: hidden from the main raw photo gallery, shown in its category grid, the Details tab, and any Collection. See ADR-0013.
_Avoid_: "normalized image" (legacy code term — same thing); **"annotation"** (a *different* concept — see Flagged ambiguities).

**MediaCategoryGroup** vs **MediaCategory** (sharpened 2026-06-12):
A **Group** is a broad theme drawer (Physical Features, Body Marks, Poses, Profile) — purely organisational, **never** a unit of comparison. A **Category** is a **single comparable locus** (Eyes, "standing pose front", a headshot framing) — *the* unit of the cross-person grid, carrying **at most one** Alignment Template. Two kinds: **locus categories** (a single anatomical place — alignable, opt into a template) and **entity-collection categories** (`entityModel` set: Tattoos, Scars, Piercings — many distinct objects, template-less plain buckets). Multiplicity of framings within a theme lives at the **Group** level (many pose categories under one "Poses" group), never as multiple templates on one category.

**Profile category group** (planned, ADR-0016):
The person's **normalized framings** (Headshot, Half-body, Full-body, …) modelled as an ordinary MediaCategory group — *not* a separate "slot" mechanism. Categories hold **many** aligned images per person (like detail-loci); they show in the person browser and are Atlas-comparable. The **Headshot** category is a system, undeletable category and the **avatar source**. Supersedes the legacy 5 "profile slots" (`PersonMediaLink.usage=HEADSHOT` + `slot`, `MotifTemplate.slot`, `p-img0*` settings), which are retired on unification. _Avoid_: "slot" (the legacy term — it's a Profile category now).

**Representative**:
Per **(person, MediaCategory)**, the one aligned image displayed for that framing in the browser (`PersonMediaLink.isRepresentative`, ≤1 per person+category). Default when unmarked: the **most recent** image.

**Avatar** (revised by ADR-0016):
A person's ID-card picture, shown on cards and the hero. **Defined as the representative of the Headshot category** — not an independently-settable flag. Changing the avatar = changing the Headshot representative. (Retires `PersonMediaLink.isAvatar`.)

**Atlas**:
The automatic **cross-person comparison** surface (`/atlas`). Pick a locus category → see every person's Aligned image in that locus side by side. Generated from the alignment data, not curated. Distinct from a **Collection** (hand-curated) and from the per-person **Details tab** (one person's loci). _Avoid_: "Compare" / "Details" as the surface name — the latter collides with the Details tab.

**Before/after collection**:
A `MediaCollection` with `layout = SIDE_BY_SIDE`. Its members are **Comparisons** (not photos), agnostic to whose/when. Serves both temporal (same person over time) and cross-person comparison. Era-linking is deferred polish.

**Comparison** (code model & DB table: `Comparison`, added 2026-06-13):
A curated, ordered group of **2…N member photos** that belong together — "the row of cells" you compare. It is a **member of exactly one** before/after collection (composition, not a reusable asset). Browsable as one **montage tile** (auto-generated from its members, before→after order — no chosen cover) and openable to the comparison viewer (cells in a row; a reveal **slider** when there are exactly 2). The analog is a Lightroom **stack** + a clinical **before/after** object. See ADR-0015. _Avoid_: "cover" (there is none — the tile is a montage); calling the flat photo list a comparison (that was the superseded first cut).

**Aspect-driver**:
The one Comparison member (user-chosen, default first, independent of everything else) whose width:height sets the **cell shape** for the whole comparison — the frame the others conform to.

**Fit mode** (`ComparisonFitMode`): how non-driver images sit in the governing-shaped cells. **`COVER`** (default) fills + crops to the cell with a per-cell **focal point** (`ComparisonItem.focalX/Y`); **`CONTAIN`** letterboxes the whole image (bars when shapes differ). COVER+focal is "alignment by hand"; CONTAIN is the escape hatch. See ADR-0015.

**Stitched comparison** (deferred):
A flattened single-JPEG **export** of a Comparison for **external** use. Not a `MediaItem` and not session-bound (a comparison can be cross-person/global, with no honest session); when built, an on-demand canvas stitch optionally cached as a raw object (`exportRef`, like `MotifTemplate.silhouetteRef`). Out of scope until the Comparison entity + viewer exist.

**Bake source** (added 2026-06-14):
Which resolution an Aligned image was sampled from. **Master-derived** (the default) bakes from the in-app `master_4000` — a proportional ≤4000px downscale of the original. **HD / original-sampled** bakes from the **archive original** (full resolution on disk). Same template, same keypoints, **same output size** (`bakeLongSide`) — the only difference is pixel density, so a template that zooms into a small locus (eyes) is sharp instead of soft. An Aligned image's bake source is a refinable attribute, not part of its identity. See ADR-0017.

**HD re-bake** (added 2026-06-14):
The operation that **replays** an Aligned image's existing alignment (same keypoints, recomputed transform) against the **archive original** and **overwrites it in place** — same `MediaItem` id, refreshed pixels, flipped to bake-source = original. A silent replay (no re-clicking — the master is a pure downscale, so the geometry is identical). **Deterministic + repeatable**, so no version history is kept (re-bake-from-master is the "revert"). Eligible only when the source traces to an archive file (`SetMediaItem → ArchiveLink → ArchiveFolder.fullPath` + `filename`, present on disk, higher-res than the master); reference-only-upload Aligned images are **ineligible** (no original exists). See ADR-0017.

**Archive re-bake agent** (added 2026-06-14):
The local Node agent that performs HD re-bakes — the **same pattern as `scripts/archive-scan.ts`**: runs on the Windows machine that holds the archive, authenticated by API key, reads originals off the local filesystem (which the Unraid app server cannot). It pulls the app's **eligible worklist**, reads `{fullPath}\{filename}`, integrity-checks it, bakes at full resolution locally, and **POSTs back only the small baked result** (the multi-MB original never leaves the machine). Manual/batch (whole-library or scoped; `--dry-run`, `--force`), not auto-triggered. See ADR-0017.

### Watchlist scan workflow (added 2026-06-10)

**Scrape source** (code model & DB table: `ScrapeSource`):
An external platform whose profile pages can be scraped into import files. The registry records which platforms are **scannable** (have a scraper) and how their URL file is shaped. A reference-only link (IAFD, Boobpedia) is *not* a scrape source's scannable target. Subsumes the legacy hardcoded domain→platform map.

**Scannable identity page**:
A `PersonDigitalIdentity` whose platform is a scannable scrape source and which isn't individually excluded (`excludeFromScan`). These are the units a scan round selects.

**Scanned-through date** (`PersonDigitalIdentity.scannedThroughAt`):
Per identity page. The scrape date (`ImportBatch.extractionDate`) of the newest import landed from that page — the page's content is known-current up to here. Advances monotonically forward; `null` = never scanned.

**Scan round**:
An ephemeral selection of scannable identity pages, exported as one URL file per platform for the external scrapers. **Not persisted** — the import is the sole source of truth for what has been scanned.

**Needs rescan**:
A derived per-person signal: an archive-born set (a `StagingSet` with no import batch, created manually from the Archive) has a release date newer than the person's newest scanned-through date — evidence of releases not yet pulled from the source pages.

## Flagged ambiguities

- **"Persona"** — In the wider domain a "persona" usually means a stage identity / working name. In Pulseboard it does **not**: stage names are **Aliases** (`PersonAlias`). The concept is an **Era** — a phase on the Person's development timeline. The legacy `Persona` Prisma model + DB table were renamed to `Era` in May 2026 — no Persona references remain in current code or docs. If you find one, it's either inside `prisma/migrations/` (historical) or it's drift worth fixing.
- **"natural" vs "current"** — Older fields (`naturalHairColor`, `naturalBreastSize`, `currentHairColor`) implied a fixed-vs-live split. There is no such split: a changing attribute has exactly one timeline, whose first value is on the **Baseline** Era. "Natural" is simply the Baseline value.
- **"Snapshot"** — In the broader domain, a point-in-time observation without era information often warrants a distinct row type. Pulseboard has no `Snapshot` entity: an imported observation is just a delta — by default written to **Baseline** as best-guess; the source-explicit-status exception (e.g. `breastDescription="enhanced"`) routes specific values to an undated-changes Era. The conceptual tension resolves via policy, not schema. See ADR-0008.
- **"Annotation" vs "Aligned image"** — Two separate kinds of derived image, never to be conflated. An **Annotation** (`MediaItem.isAnnotation`) is a cropped/highlighted derivative made to emphasise a topic — a tattoo, a body mark. An **Aligned image** is a template-framed baked copy made for *comparison* (see Imagery & alignment). They differ in purpose (highlight vs compare), in marker (`isAnnotation` vs alignment-template binding + provenance), and in surface. The current Motif headshot bake borrows `isAnnotation=true` to hide itself — that reuse is the one conflation to remove; aligned-ness must be identified by the template binding, not the annotation flag. See ADR-0013/0014.
- **"Re-import"** — Importing a file that contains a person whose ICG-ID already exists. Operationally indistinguishable from a first-time import at upload (same workflow); the system handles the matched-person case via a gated per-attribute review (`ImportItemStatus = PENDING_ATTRIBUTE_REVIEW`). Each non-identical delta becomes an explicit Accept/Decline decision; nothing flows through silently. **Principle: absence is information** — an empty field, a missing alias, or a verified-unknown flag in the DB might be intentional (the user cleared it, removed it, or marked it unknown), so the review surfaces additions and fill-gaps too, not just true conflicts. Sets are the carve-out — auto-flow to staging by external-set-id. See ADR-0009.

## Example dialogue

> **Dev:** Mira's detail page shows her current hair as blonde — where does that come from?
> **Expert:** The **Fold**. Her **Baseline** Era has hair = brown — her starting value. A later Era, "2021 — went blonde", carries a scalar **delta** setting hair = blonde. The Fold replays Baseline plus every delta in date order, so blonde wins.
> **Dev:** And the rose tattoo?
> **Expert:** That's an **identity-bearing** changing attribute — a parent record with an **Event** log. It has an `added` Event filed in the "2019" Era. If she has it lasered off, that's a `removed` Event and the Fold drops it from **current state**.
> **Dev:** What if the tattoo's date was wrong and it was really 2022?
> **Expert:** She re-dates the Event. It stays in whatever Era she filed it under — membership is sticky — but the Fold re-sorts by the Event's own date. If that makes two Eras' spans overlap, she gets a tidy-up flag.
> **Dev:** So an Era isn't a date range?
> **Expert:** Right — it's a curated phase, a folder. Its displayed span is just the range of the deltas inside it.
