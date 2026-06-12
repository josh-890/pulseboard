# Alignment templates generalise Motif templates and bind to a MediaCategory

Decided 2026-06-12 (design review, /grill-with-docs — not yet implemented).

## Context

The Motif Template system standardises **profile-slot headshots**. `MotifTemplate` is welded to a profile position by `slot Int @unique`, and the bake assigns the result to `PersonMediaLink(usage=HEADSHOT, slot)`. The template is a pure geometric recipe — target keypoints (frame fractions) + output aspect + bake long side — and is *not* conceptually tied to headshots; only the `slot` field ties it there.

The user wants the same "same visual impression" mechanism for three more surfaces: per-person detail loci (eyes), an automatic **cross-person comparison grid** (the *Atlas*), and curated before/after composites. Grilling collapsed all three to **one mechanism** (a generalised alignment recipe that bakes a comparable image) differing only in the *container that displays the result*. The question is **what an alignment recipe targets** once the headshot `slot` weld is removed, and **what the unit of comparability is**.

The existing detail-photo taxonomy is the natural spine. Detail photos carry `PersonMediaLink.categoryId` into a two-level structure:

- `MediaCategoryGroup` — e.g. Physical Features, Body Marks, Body Modifications, Cosmetic Procedures.
- `MediaCategory` — e.g. Eyes, Nose, Lips, Hands (loci); Tattoos, Scars, Piercings, Breast (entity-collections, `entityModel` set).

Two category kinds surface from the seeded data: a **locus** (Eyes — a single anatomical place, one framing fits all) and an **entity-collection** (Tattoos — many distinct objects at many framings, no single framing). Only the locus kind is alignable.

## Decision

**Generalise the recipe to an "Alignment Template" (concept; code model name `MotifTemplate` retained) and bind it to a `MediaCategory`, 0:1.**

- **`MediaCategory.alignmentTemplateId String?`** (at most one template per category). Locus categories set it → alignable, and an automatic cross-person grid lights up. Entity-collection categories leave it null → plain organisational buckets (today's behaviour, unchanged).
- **The unit of comparability is the Category** (which, given 0:1, is the template). The Atlas grid is "every Aligned image in this locus category across persons." When a category has no template it is invisible to the Atlas.
- **Multiplicity lives at the Group, not the category.** A "Poses" *group* holds many single-framing *categories* ("standing pose front", "sitting pose left"), each with one template. Sharpened definitions: **Group = a broad theme drawer, never comparable**; **Category = a single comparable locus, the grid unit.**
- **Profile slots become a category group (end state).** The 5 headshot "slots" are 5 loci of a built-in **Profile** group; `slot @unique` is retired (slot → a category ordinal). This unification is **sequenced last**, after the general category-bound path is built and tested, because the hero avatar (`getHeadshotsForPersons`, `headshotDataFromLink`) and `slot-manager.tsx` key off `usage=HEADSHOT` + `slot` and must be rewired + regression-verified.
- **Per-entity over-time comparison is NOT a category template.** Comparing one specific tattoo before/after laser removal is a curated **Collection** (`layout=SIDE_BY_SIDE`), not an entity-category recipe — entity-collection categories stay template-less.

## Why

- **Reuse the spine, don't fork it.** Categories already organise detail photos and already carry `categoryId` on the link. Binding alignment to the category makes idea (1) (one person's eyes) and idea (2) (everyone's eyes) the *same data viewed two ways* — the cross-person grid is almost free.
- **0:1, not 1:many.** True comparability holds only among images baked against the *same* template. If a category carried several templates the grid would mix incompatible framings. Keeping it 0:1 and pushing multiplicity to the Group preserves the "same visual impression" guarantee and matches how the user actually thinks ("standing pose front" is its own category).
- **Locus vs entity-collection is a real, data-grounded distinction.** "Align all tattoos" is meaningless; "align all eyes" is the whole point. The nullable binding encodes exactly that — alignable categories opt in, entity buckets opt out, no special-casing.
- **One binding mechanism.** Folding profile slots into categories removes the parallel `slot`-bound path, honouring the project's "one meaningful target" principle. Sequencing it last keeps the load-bearing hero avatar stable while the general path is proven.

## Considered and rejected

- **Category : AlignmentTemplate = 1:many** (template is the comparability unit, category a loose grouping above it). Rejected after grilling: the user's taxonomy puts each single framing at the *category* level ("standing pose front"), with breadth at the *group* level ("Poses"). 1:many would let a category mix incompatible framings in one grid.
- **Keep `MotifTemplate.slot` and add category binding alongside (dual path).** Lower migration risk, but leaves two parallel binding mechanisms permanently and keeps the `slot @unique` weld. Rejected as the end state; the staged sequence (general path first, headshot unification last) gets the low-risk ordering without accepting a permanent dual path.
- **Model "Profile" as several top-level categories (Headshot, Half-body, Full-body) instead of one Profile group with several loci.** Rejected: they share one theme; a Group is exactly the right drawer for them, and it generalises to "Poses", "Facial features", etc.
- **A separate "theme" axis independent of MediaCategory.** Rejected: themes the user named (eyes, poses) *are* loci/categories; a parallel axis would duplicate the category taxonomy.

## Consequences

- New nullable column `MediaCategory.alignmentTemplateId`; `MotifTemplate` broadened to category-bound, `slot @unique` retired only at the final unification slice. Hand-written migrations + `prisma migrate deploy`, applied to **both** prod tenants via `scripts/deploy-migrations.sh`.
- The existing Motif Aligner (`motif-aligner.tsx`) already accepts arbitrary keypoints, so it generalises to any locus category's template with a new "Align to category" entry point.
- New surfaces: per-person **Details tab** shows a locus category's Aligned images (mixed with raw); the **Atlas** (`/atlas`, `/atlas/[category]`) is the automatic cross-person grid; **Collections** gains a `layout` (`GRID` | `SIDE_BY_SIDE`) for curated before/after composites.
- The **headshot-unification slice** must reclassify existing baked headshots from "annotation" to "aligned" (per ADR-0013) and rewire the hero avatar — mandatory regression check on `/people` and person cards.
- Per-entity before/after (one tattoo over time) is a Collection concern, deliberately *not* served by category templates.
