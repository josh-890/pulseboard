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

## Phase 1 — Add `Channel.labelId`, backfill, dual-write (no reader changes)

The schema add + a backfill that makes `labelId` identical to today's resolution.

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

## Phase 2 — Migrate the load-bearing reader: set-import → Session label

The highest-value, lowest-risk swap (backfill guarantees identical output).

1. In `import-executor.ts` (lines ~1015 and ~1316), replace
   `channelLabelMap.findFirst(...)` with a read of `channel.labelId`.
2. Keep a fallback: if `channel.labelId` is null, fall back to the old `findFirst`
   (covers any channel created before dual-write; remove the fallback in Phase 5).
3. Phase 0's characterisation tests must still pass **unchanged**.

**Gate:** targeted vitest (import-executor) + lint; manual import of one person/set
on a non-default tenant; confirm Session label unchanged.

---

## Phase 3 — Migrate query/aggregation readers (one at a time)

Each is an independent, separately-verifiable swap from
`channel.labelMaps.some({ labelId })` → `channel.labelId`. Dual-write keeps the map
valid throughout, so these can land in any order, individually.

| Reader | Location | Swap |
|---|---|---|
| `/sets` label filter | `set-service.ts:57,173,437` | `where.channel = { labelId }` |
| Set label KPI/counts | `set-service.ts:419-469` | group by `channel.labelId` |
| Career-tab affiliation pills | `career-service.ts` (`deriveAffiliations`) | resolve via `channel.labelId` |
| Set hero / grid / channel card label display | `set-hero.tsx`, `set-grid.tsx`, `channel-card.tsx` | include `channel.label` directly |
| person / label / session service label reads | respective services | `channel.labelId` |

For each: update the query, update the matching Phase-0/fixture test, verify the
affected route in Playwright (`/sets` filter + counts; `/people/[id]` Career tab;
`/channels/[id]`).

**Gate per reader:** targeted vitest + lint + Playwright on the touched route. Batch
the `npm run build` gate when a client/server-boundary file is in the set.

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
