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

## Phase 1 — Data audit + backfill (per tenant, dry-run first)

1. **Audit script** `scripts/audit-credit-kinds.ts` (read-only): report
   - role-less `SetCreditRaw` (no `roleDefinitionId`), split by resolved Person /
     resolved Artist / unresolved;
   - Behind-Camera credits with `resolvedPersonId` set (old dual-path leak);
   - On-Camera credits with `resolvedArtistId` set (shouldn't exist).
2. **Backfill** `scripts/backfill-credit-roles.ts` (`--apply`): role-less credits that
   are resolved-as-Artist **or** unresolved-from-import → set `photographer` role.
   Leave role-less resolved-Person credits for manual review (surfaced by the audit).
3. The Behind-Camera-resolved-to-Person leaks: **report only** this phase; decide
   handling in Phase 4 (likely re-resolve as Artist, grilled if non-trivial counts).

**Gate:** run audit on dev + pulse + xpulse; apply backfill per tenant after dry-run
review. Re-run audit → role-less import artists = 0.

---

## Phase 2 — Imported artist credits carry the `photographer` role

The three artist-credit creation sites attach the Behind-Camera role so new imports are
unambiguous (and immediately appear in the session view):

- `import-executor.ts` → `createNewSet` (artist block ~1056)
- `import-executor.ts` → `enrichExistingSet` (artist block ~935)
- `import-executor.ts` → `promoteManualStagingSet` Path B (artist block ~1400)

Each resolves the `photographer` role id once and sets `roleDefinitionId` on the created
`SetCreditRaw` (still `UNRESOLVED` — the user resolves it to an Artist later, or it shows
by raw name meanwhile).

**Gate:** tsc + lint + build; promote a staging set with an artist on dev → credit has
the photographer role; confirm it shows in the session view after Phase 3 (clean up the
test set after, per project rule).

---

## Phase 3 — Session contributor view = union

The load-bearing read change. Where `getSessionContributions` (or the
`/sessions/[id]` page) builds the contributor list:

1. Fetch the session's behind-camera credits: `SetSession → Set → SetCreditRaw` where the
   credit's role group is **Behind Camera** and status ≠ `IGNORED`, selecting
   `rawName`, `resolvedArtist {id,name}`, `roleDefinition {name}`.
2. Merge via the Phase-0 `mergeSessionContributors` helper → render Person contributions
   and Artist credits in one list, each tagged by kind. Behind-camera entries link to the
   Artist (when resolved) and are visually marked read-only / "from set credit".
3. De-dup across the session's sets (one Artist/raw-name per role).

**Gate:** tsc + lint + build; Playwright on `/sessions/[id]` for a session whose set has a
photographer credit (resolved Artist *and* unresolved raw name both appear); a model-only
session is unchanged.

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
