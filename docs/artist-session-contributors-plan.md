# Behind-camera Artists in sessions — implementation plan

Implements **ADR-0021**. No schema change (the whole point of Option C). Work is
additive + reversible; gated per phase (tsc + targeted vitest + lint default; build
when client/server boundary or services are touched). Multi-tenant: any data
backfill/audit runs per tenant via `DATABASE_URL` (dev → pulse → xpulse), dry-run
first.

Role taxonomy (both tenants): group **On-Camera** = `model`, **Behind Camera** =
`photographer`. "Behind-camera" = a credit whose `roleDefinition.group.name ===
"Behind Camera"`.

---

## Phase 0 — Characterise the contributor-kind rule (pure) ✅ DONE (2026-06-24)

Pure, tested helpers in `src/lib/services/session-contributors.ts`:
- `contributorKindForRoleGroup(groupName)` → Behind Camera → `artist`, else `person`
  (`BEHIND_CAMERA_GROUP` constant).
- `mergeSessionContributors(personContribs, behindCameraCredits)` → Persons first,
  then behind-camera Artists de-duped per role by `artistId` (resolved) or normalized
  raw name (unresolved); `displayName = resolvedArtistName ?? rawName`.

Tests (`__tests__/session-contributors.test.ts`, 9): kind mapping, person-first order,
resolved-by-name, **unresolved-shows-by-raw-name**, dedup (resolved + raw), no cross-role
merge, resolved-vs-raw distinctness. Gate: tsc · eslint · 9/9 tests. No behaviour change.

---

## Phase 1 — Data audit + backfill ✅ DONE (2026-06-24)

`scripts/audit-credit-kinds.ts` (read-only) + `scripts/backfill-credit-roles.ts`
(role-less, non-Person, non-ignored credits → `photographer` role; dry-run/`--apply`).

Audit (before): dev 19 role-less · pulse 0 · **xpulse 197** (192 resolved-artist + 5
unresolved); **0** role-less-resolved-Person anywhere; Behind-Camera→Person leaks: 0
on prod, 1 on dev (seed `M. Reed`); On-Camera→Artist anomalies: 0. So the backfill was
unambiguous and the old dual-path was never used on prod.

Applied: dev 19, **xpulse 197** credits given the photographer role; pulse 0 (nothing
to do). Re-audit: xpulse role-less = 0, leaks = 0. The single dev seed leak is test data
(no prod action). **Gate met:** role-less import artists = 0 on prod.

---

## Phase 2 — Imported artist credits carry the `photographer` role ✅ DONE (2026-06-24)

All three artist-credit creation sites in `import-executor.ts` (`createNewSet`,
`enrichExistingSet`, `promoteManualStagingSet` Path B) now set
`roleDefinitionId: await getPhotographerRoleId(tx)` on the created `SetCreditRaw`
(still `UNRESOLVED`). New helper `getPhotographerRoleId(tx)` looks up the `photographer`
role by slug; null fallback → role-less (graceful). So new imports stay role-clean
without needing the backfill again. **Gate:** tsc · eslint · build clean.

---

## Phase 3 — Session contributor view = union ✅ DONE (2026-06-24)

The load-bearing read change.
- `getSessionBehindCameraCredits(sessionId)` (contribution-service): `SetSession → Set →
  SetCreditRaw` where role group = `BEHIND_CAMERA_GROUP` and status ≠ `IGNORED`, returns
  `BehindCameraCredit[]`.
- `/sessions/[id]/page.tsx`: deduped via `mergeSessionContributors([], credits)`; the
  Contributors card renders Person `ContributionParticipantRow`s **then** the behind-camera
  entries via the new read-only `BehindCameraContributorRow` (links to `/artists/[id]` when
  resolved, "unresolved" chip + raw name otherwise; "{role} · from set credit"). Card count
  and empty-state account for both. Reference sessions skip it.

**Gate:** tsc · eslint · build clean. Data path validated read-only on dev + xpulse
(sessions resolve real photographers — Stefan Soell, Alex Lynn, Leonardo). Live visual
render lands with the app rebuild; full Playwright pass deferred to that (dev server not
running here; the row is thin + build-validated).

---

## Phase 4 — Resolution-path cleanup (remove the dual-path)

1. `credit-resolution-panel.tsx`: the resolve **kind is fixed by the credit's role
   group** — Behind-Camera credit → Artist search/create only; On-Camera → Person only.
   Remove the person/artist toggle and the `roleDefinitionId ? person : artist`
   role-less default (after Phase 2+backfill there are no role-less credits).
2. Optional service guard: `resolveCreditRaw` refuses a Behind-Camera credit (defence in
   depth), `resolveCreditAsArtistRaw` refuses an On-Camera credit. Low-risk; keeps the
   invariant even if a caller is missed.
3. Resolve the Phase-1 Behind-Camera→Person leaks (re-resolve as Artist), grilled if the
   count is non-trivial per `feedback_grill_before_destructive_cleanup`.

**Gate:** tsc + lint + build; Playwright: a photographer credit offers only Artist
resolution, a model credit only Person.

---

## Out of scope

- Polymorphic `SessionContribution`/`SetParticipant` (ADR-0021 Option B — rejected).
- Cross-linking a human who is both a model and a photographer (Person ↔ Artist identity).
- Session-level authoring of behind-camera contributors (they're set-credit-authored).
- Showing **unresolved on-camera** raw names as contributors (deliberately excluded).

## Doc-keeping checklist

- [x] `CONTEXT.md` — Credits & contributors section (Credit / on-camera-behind-camera
      split / Artist / Contribution+Participant). Landed during grilling.
- [x] `docs/adr/0021` — this decision.
- [ ] `docs/architecture.md` — note the session-contributor union once Phase 3 lands.
- [ ] `docs/user-guide.md` — credits/contributors: photographer vs model behaviour.
- [ ] `loading.tsx` — `/sessions/[id]` skeleton if the contributor section layout changes.
