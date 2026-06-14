# HD re-bake: refine Aligned images from archive originals via a local agent

Decided 2026-06-14 (design review, /grill-with-docs). **Implemented 2026-06-14** (slices 1–5). Builds on ADR-0013 (Aligned images are baked derived copies) and ADR-0014 (templates bind to a MediaCategory).

## Context

Pulseboard deliberately never stores original image files — to save space it keeps only a `master_4000` variant (the original proportionally downscaled to ≤4000px long side, `fit: inside, withoutEnlargement`; see `media-upload.ts`). For most uses that's plenty.

It is **not** plenty for **Aligned images**. An Alignment Template (ADR-0013/0014) bakes a standardized framing by sampling a region of the source and resampling it to the template's output size (`bakeLongSide`). When the template zooms into a small locus — eyes especially — the bake samples a small patch of the 4000px master and upscales it, so the result is visibly soft. The true archive original (often 6000–8000px) holds the detail; the master threw it away.

Key facts that shape the solution:

- **The master is a pure proportional downscale, not a re-crop.** So an Aligned image's stored keypoints map onto the true original by a single scale factor — the alignment can be **replayed** at full resolution with **zero human input**. Re-doing the bake by hand is unnecessary.
- **The app server (Unraid container) cannot read the archive.** Archive paths are Windows scanner-host paths; the container has no mount. But `scripts/archive-scan.ts` already establishes the pattern: a **local Node agent** on the Windows machine, authenticated by API key, that reads the filesystem and talks to the app over HTTP.
- **The archive linkage already exists.** `SetMediaItem → ArchiveLink → ArchiveFolder.fullPath`, and `MediaItem.filename` is preserved — so the original's path is computable for any archive-backed source.

## Decision

Add an **HD re-bake**: replay an Aligned image's alignment against its **archive original** and overwrite it in place. Performed by an **archive re-bake agent** (a mode of / sibling to the scan agent), not by the app server or the browser.

- **D1 — Silent replay, not re-verification.** Reuse the stored keypoints verbatim (the master is a pure downscale, so the geometry is identical); recompute the transform at the original's resolution and bake. No re-clicking. (Considered: re-open the aligner with points pre-placed — rejected as busywork for a geometrically-identical operation. A manual re-align is always still available the normal way.)
- **D2 — Agent-side, not browser, not server.** The agent reads `{fullPath}\{filename}` off the local disk (the browser can't auto-read local paths even on that machine; the server can't reach them at all), bakes at full resolution, and **POSTs back only the small baked result**. The multi-MB original never transits the network or lands in MinIO — consistent with the "don't store originals" ethos. (Implementation: the agent bakes with `@napi-rs/canvas` using the **identical** `setTransform` + `drawImage` calls as the browser aligner — guaranteeing the same framing — rather than Sharp's `affine`, whose output-window control made an exact match awkward.)
- **D3 — Eligibility = archive-backed source, integrity-checked.** Eligible iff the Aligned image's source `MediaItem` resolves to an on-disk archive file (`ArchiveLink → fullPath` + `filename`, not `missingOnDisk`) that is **higher-res than the master**. The agent verifies the file against the source's stored `hash` (else dimensions/aspect) and **skips + reports** mismatches (renames/edits since the last scan). Reference-only-upload Aligned images are ineligible — no original exists.
- **D4 — Overwrite in place; no version history.** Keep the same Aligned `MediaItem` id, regenerate its variants from the new bake, flip a queryable `bakeSource` (`master → original`) + record `hdBakedAt`. Every reference (representative pointer, category link, collection/comparison membership, focal point) stays valid. The op is deterministic and repeatable, so no history is retained — "revert" is just "re-bake from master." New MinIO keys (or a version token) bust caches.
- **D5 — Same output size.** Keep the template's `bakeLongSide`; the win is **sharpness at that size**, not a bigger image. Growing the output is a separate, opt-in, per-template storage-cost lever, deferred.
- **D6 — Manual batch trigger, app-computed worklist.** The agent pulls the app's **eligible worklist** (whole-library default; scoped per person/session/set; `--dry-run`, `--force`). Not auto-triggered (originals are unreachable from the server). The app surfaces the eligible **count** + an **HD badge** on aligned tiles; a normal scan run prints "N eligible — run the re-bake pass."

## Consequences

- New: `MediaItem.bakeSource` (`MASTER`/`ORIGINAL`) for the worklist query; keypoints stored as **fractions** (provenance v2) so replay is resolution-independent (legacy pixel-point provenance normalized via the source's master dims at re-bake time); the worklist + in-place re-bake endpoints (agent-authenticated); shared pure `lib/image/bake-geometry.ts`; the `scripts/archive-rebake.ts` agent (baking with `@napi-rs/canvas`, a new devDependency).
- The feature is **only useful on the Windows archive machine** and only for archive-backed Aligned images — by construction. That's accepted: it's exactly where the originals and the blurry-eyes problem live.
- Re-aligning an image on the master (new keypoints) resets it to master-derived → eligible again. The flag + worklist handle that naturally.

## Status

Implemented 2026-06-14 (slices 1–5).
