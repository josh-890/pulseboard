# Channel → owning Label migration plan

Implements **ADR-0020**. Governing constraint: **nothing breaks**. The migration is
**additive + dual-written + reader-by-reader**, with `ChannelLabelMap` kept as the
live safety net until the final phase. No atomic flips; every phase ships and is
verified on its own.

Domain reference: `CONTEXT.md → Production & publication`. Tenancy: every schema +
data step runs on **all** tenant DBs via `scripts/deploy-migrations.sh` (pulse +
xpulse) — hand-write migrations, `migrate deploy` only (see project memory).

---

## Phase 0 — Freeze the current behaviour in tests ✅ DONE (2026-06-23)

Pin today's resolution so later phases can prove equivalence. Done house-style:
the two decision points Phases 2 & 4 will change were **extracted into pure
functions** (behaviour-preserving) and characterised — runnable in WSL with no DB,
matching the `archive-match-score.test.ts` pattern.

1. **Set-import → Session label** — extracted `pickOwnerLabelId(maps)` in
   `src/lib/services/label-resolution.ts` (the "owning label = highest-confidence
   `ChannelLabelMap`" rule). Both `import-executor.ts` blocks now `findMany` +
   `pickOwnerLabelId` instead of `findFirst(confidence desc)` — same result. This
   is the **single rule Phase 1's backfill reuses**. Tests:
   `__tests__/label-resolution.test.ts` (single / multi / zero-map, order-independence,
   tie-stability).
2. **Merge guard** — extracted `setMergeBlockReason(a, b)` in `set-merge-service.ts`
   (verbatim externalId + channelId messages); `mergeSetRecords` routes through it.
   Tests: `__tests__/set-merge-block-reason.test.ts` (same-channel allow, one-sided
   null allow, different-channel block, externalId-conflict block). Phase 4 edits
   only this function + these expectations.
3. **`/sets` label filter + KPI counts** — *deferred to Phase 3.* A Prisma
   `where`-fragment isn't meaningfully unit-testable without a DB, and DB-integration
   tests need the local PG that's absent in WSL (`feedback_full_vitest_needs_local_pg`).
   It is pinned + swapped together with the query change in Phase 3, where it belongs.

**Gate:** ✅ `tsc --noEmit` clean, `eslint` clean on all touched files, 11/11 new
tests green. No behavioural change (refactor only).

---

## Phase 1 — Add `Channel.labelId`, backfill, dual-write ✅ DONE on dev (2026-06-23) · prod deploy PENDING

The schema add + a backfill that makes `labelId` identical to today's resolution.
**Status:** code + migration landed; applied + verified on `pulseboard_dev`
(67/67 channels backfilled, 0 invariant mismatches). **Prod (pulse + xpulse)
migration deploy + invariant re-run is the remaining gated step.**

Done:
- `Channel.labelId` FK + `@@index([labelId])` (`schema.prisma`); migration
  `20260623120000_channel_owning_label` (column + FK `ON DELETE SET NULL` +
  backfill `DISTINCT ON (channelId) … ORDER BY confidence DESC, labelId ASC`).
- Dual-write: `createChannelRecord` (FK on create), `updateChannelRecord` (FK on
  label replace), `deleteLabelRecord` (recompute affected owners via new
  `syncChannelOwnerLabel`). `deleteChannelRecord` needs nothing (row removed).
- Invariant script `scripts/check-channel-owner-invariant.ts` (reuses
  `pickOwnerLabelId`); run per tenant with `DATABASE_URL` pointed at it.
- Gate: tsc clean · eslint clean · `npm run build` clean · 11/11 pure tests ·
  dev invariant 0 mismatches. (DB-integration vitest skipped to avoid mutating
  shared remote dev DB; the invariant script is this phase's DB verification.)

Original step list (for reference):

1. **Migration** `…_channel_owning_label`: add nullable
   `Channel.labelId String?` + FK to `Label` + `@@index([labelId])`.
2. **Backfill** (same migration or a paired data migration): for each channel,
   `labelId = ChannelLabelMap.findFirst(orderBy confidence desc).labelId`. Channels
   with no map stay null. **Per tenant.**
3. **Dual-write** at the two authoring points so the FK and the map never diverge:
   - `createChannelRecord({ labelId })` — write `Channel.labelId` *and* keep the
     `ChannelLabelMap` row (channel-service.ts:86).
   - The import channel-link routes (`/api/import/channels/create-and-link`,
     `/api/import/channels/link`) and `channel-resolution.tsx` — set `labelId` too.
   - Any "change a channel's label" edit path — update both.
4. **Invariant check** (script + test): for every channel,
   `Channel.labelId === findFirst(confidence desc)`. Run on both tenants after
   backfill.

**Gate:** full vitest + `npm run build` (schema + client/server boundary touched);
deploy migration to all tenants; verify the invariant on pulse + xpulse. **No
reader uses `labelId` yet** — zero behavioural change.

---

## Phase 2 — Migrate the load-bearing reader: set-import → Session label ✅ DONE (2026-06-23)

The highest-value, lowest-risk swap (backfill guarantees identical output).
**Status:** both `import-executor.ts` blocks now read `Channel.labelId` first
(via `tx.channel.findUnique`), with a **lazy** map fallback (`findMany` +
`pickOwnerLabelId`) only when the FK is null. Rule extracted + tested as
`resolveOwnerLabelId(channelLabelId, maps)`. Result is identical to Phase 1 for
every channel (invariant holds), so a live import wasn't needed to confirm the
happy path; the fallback covers only the migration-window edge (FK null + map
present), which no current dev/prod channel hits (all have FKs). Gate: tsc ·
eslint · build clean · 15/15 pure tests (Phase 0 tests unchanged + 4 new).

1. In `import-executor.ts` (lines ~1015 and ~1316), replace
   `channelLabelMap.findFirst(...)` with a read of `channel.labelId`.
2. Keep a fallback: if `channel.labelId` is null, fall back to the old `findFirst`
   (covers any channel created before dual-write; remove the fallback in Phase 5).
3. Phase 0's characterisation tests must still pass **unchanged**.

**Gate:** targeted vitest (import-executor) + lint; manual import of one person/set
on a non-default tenant; confirm Session label unchanged.

---

## Phase 3 — Migrate query/aggregation readers

Swap `channel.labelMaps.some({ labelId })` → `channel.labelId`. Dual-write keeps the
map valid throughout, so readers land individually.

### Phase 3a — label *filters* ✅ DONE (2026-06-23)

The load-bearing, isolated `where`-clause swaps (no shape/consumer changes):
- `set-service.ts` — `/sets` label filter (×2) + facet KPI counts (×2)
- `career-service.ts` — career-tab label filter (sets + staging)
- `channel-service.ts` — channel browser label filter

**Verify:** tsc · lint · build clean. Read-only data check: **pulse 0 / xpulse 0
multi-map channels → filter swap byte-identical on prod**; dev has 1 test artifact
where the FK filter correctly returns owner-only (the intended ADR-0020 semantics).

### Phase 3b — *display* reads → DEFERRED to Phase 5

The remaining `channel.labelMaps[0].label` → `channel.label` reads (set-hero,
set-grid, channel-card, channel detail, person work-history, staging-set service,
suggest route) are **not load-bearing** — dual-write keeps `labelMaps[0]` valid, so
they render correctly as-is. Folded into the Phase 5 cleanup, where `ChannelLabelMap`
is demoted anyway. Genuine all-maps consumers (suggested-labels multi-select, alias
`labelNames`) stay on `labelMaps` as the evidence layer. **Phase 4 (merge-guard
re-key) goes next** — load-bearing behaviour ahead of cosmetic join cleanup.

---

## Phase 4 — Re-key the merge guard (the one real behavioural change)

1. `set-merge-service.ts` — replace the `channelId`-equality guard (line ~110):
   - **Block** different **owning Label** (resolve each set's
     `channel.labelId`; null-label ⇒ fall back to channel identity, never matches
     another null).
   - **Block** different **`SetType`** (photo/video siblings).
   - **Allow** same owning Label **and** same `SetType` across channels — surface an
     **explicit confirmation** in the merge UI naming both channels + the shared
     label.
2. Widen the duplicate-candidate query (`getDuplicateCandidates`) to group by owning
   Label + SetType + release window, **keeping** the existing sibling exclusion
   (`siblingId`).
3. Update Phase-0 merge-guard tests to the new matrix; add a test that a photo Set
   and its video sibling are **never** offered as a merge.

**Gate:** full vitest (merge service + cascade) + lint; Playwright: attempt an
import-born vs archive-born same-label cross-channel merge (should prompt + succeed)
and a cross-label merge (should block); confirm photo/video sibling never offered.

---

## Phase 5 — Demote `ChannelLabelMap` to evidence-only + remove fallbacks

Only after **every** reader is on `Channel.labelId`.

1. Remove the `findFirst` fallback added in Phase 2.
2. Stop writing the `confidence 1.0` owner map in `createChannelRecord` /
   link routes (the FK is now the owner). `ChannelLabelMap` writes remain only for
   genuine secondary/cross-label evidence (confidence < 1.0).
3. `getChannelsWithLabelMaps` / `suggest` route — reframe as *evidence* surfaces, or
   retire if unused after Phase 3 (verify usages first).
4. Decide the owner-map rows' fate: leave historical `confidence 1.0` rows as
   redundant-but-harmless, **or** a one-off cleanup migration deleting owner-rows
   that exactly duplicate `Channel.labelId` (destructive — grill + explicit go per
   `feedback_grill_before_destructive_cleanup`).

**Gate:** full vitest + `npm run build`; deploy to all tenants; re-run the Phase-1
invariant (now: every set's label resolves via `Channel.labelId` alone).

---

## Out of scope (explicitly deferred)

- **Physical archive reorg** to label-umbrella folders — optional future mover tool;
  disk stays frozen.
- **Forward folder-suggestion under the umbrella code** (ADR-0020 "C extension") —
  not adopted now; suggestions keep using the channel's own `shortName`.
- **Deleting empty placeholder branches** — user's manual call; the plan only makes
  them unnecessary.
- **Co-production multi-label authoring** — `ChannelLabelMap`/`SetLabelEvidence`
  already carry the secondary links; no new UI this round.

## Doc-keeping checklist (per ADR-0020 + project conventions)

- [x] `CONTEXT.md` — Production & publication section (Channel/Label/Network/Set/
      Session, emergent-label, evidence-vs-hard-link). Landed during grilling.
- [ ] `docs/data-model.md` — note `Channel.labelId` as the owning FK; clarify
      `ChannelLabelMap` is secondary evidence post-migration.
- [ ] `docs/architecture.md` — merge-guard re-key + set-import label-resolution
      change, once Phase 2/4 land.
- [ ] `docs/user-guide.md` — if the merge-confirmation UX becomes user-visible.
- [ ] `loading.tsx` skeletons — none affected (no layout change).
