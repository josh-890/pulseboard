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

## Phase 4 — Re-key the merge guard ✅ DONE (2026-06-23)

The one real behavioural change. App-code only (no migration).

Done:
- `set-merge-service.ts` — `setMergeBlockReason` → **`setMergeDecision(a, b)`**
  returning `block | confirm | allow`: block conflicting externalId / different
  `SetType` (photo-video siblings) / different owning Label; **confirm** same Label +
  same type across different channels; allow otherwise. **Null owning label falls
  back to the legacy channel-identity rule** (never treats two nulls as a shared
  label). `mergeSetRecords(a, b, { confirmCrossChannel })` throws
  **`MergeConfirmationRequiredError`** on the confirm case.
- `mergeSetAction(a, b, confirmCrossChannel?)` returns a `needsConfirmation` variant;
  `merge-set-sheet.tsx` shows an amber confirm prompt → "Merge across channels"
  re-invokes with confirmation.
- `getPotentialDuplicatePairs` widened: pairs across channels of the **same non-null
  owning label** (union with same-channel, so strictly widened) **and** requires
  equal `SetType` (photo/video siblings never paired).
- Tests: `set-merge-decision.test.ts` (9 cases — full block/confirm/allow matrix +
  null fallback + sibling block). Old `set-merge-block-reason.test.ts` removed.

**Gate:** tsc · eslint · `npm run build` clean · 18/18 pure tests · detector SQL
smoke-tested read-only on dev + xpulse (executes, 0 pairs). Live merge Playwright
left optional (the decision matrix is exhaustively unit-tested; no current dup pairs
to exercise without fabricating data).

---

## Phase 5 — Wind-down ✅ DONE (2026-06-23) — **Option A (non-destructive)**

Decision (2026-06-23): keep `ChannelLabelMap` as a **full association table** (owner
row at `confidence 1.0` + any future secondary/cross-label evidence), with
`Channel.labelId` as the **denormalized authoritative owner**. The original
"evidence-only" demotion (stop writing owner rows + a destructive row-deletion +
reworking all-maps consumers) was **considered and rejected** — destructive churn for
no present gain, since there is currently zero secondary evidence to separate out.

Done:
- Removed the now-dead Phase-2 import fallback: both `import-executor` set-import
  blocks read `channel.labelId` directly (every channel with a label has it set —
  verified 0 nulls on dev/pulse/xpulse). Dropped the orphaned `resolveOwnerLabelId`
  helper + its tests; `pickOwnerLabelId` stays (used by `syncChannelOwnerLabel`,
  the backfill rule, and the invariant script).

Intentionally **not** done (Option A):
- Owner-map writes continue (dual-write keeps FK + map in lockstep).
- Owner *display* reads (`labelMaps[0].label`) and all-maps surfaces (channel
  detail, suggested-labels, alias `labelNames`) keep reading `ChannelLabelMap` —
  correct under Option A. No row deletion. No consumer rework.

**Gate:** tsc · eslint · `npm run build` clean · pure tests green.

**Steady state:** `Channel.labelId` = authoritative owner (reads/filters/merge);
`ChannelLabelMap` = full association table incl. future co-production evidence.

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
      Session, emergent-label, evidence-vs-hard-link) + `Channel.labelId` owner FK.
- [x] `docs/data-model.md` — `Channel.labelId` as the owning FK; `ChannelLabelMap`
      kept as the full association table (Option A).
- [x] `docs/adr/0020` — final-state note: Option A (association table + denormalized
      owner FK), evidence-only demotion rejected.
- [ ] `docs/architecture.md` — `set-merge-service` was never documented at function
      level; merge model lives in ADR-0020 + data-model.md + CONTEXT.md. No edit.
- [ ] `docs/user-guide.md` — merge-confirmation UX: minor; cross-channel merge prompt
      is self-explanatory. Note if a fuller merge-docs section is added later.
- [x] `loading.tsx` skeletons — none affected (no layout change).
