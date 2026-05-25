-- Phase G Slice 16 Phase A · Step 4: resolve the 5 pending distinct-value
-- duplicate-baseline cases per project_catalog_data_quality_cleanup.md
-- item 10 (Option P — keep the more-meaningful value).
--
-- Each affected person has two ScalarDelta rows in the baseline Era for
-- the same attribute (legacy import wrote "natural color" + "current
-- color" as two baseline rows instead of one baseline + one dated delta).
-- We DELETE the current fold-winner and keep the more meaningful entry:
--
--   pulse   Connie Nielsen  hair-color  delete Blonde (dated 1983),  keep Brown (natural)
--   pulse   Eva             hair-color  delete Black  (dated 1998),  keep Brown (natural)
--   pulse   Nicole          hair-color  delete Red    (dated 1985),  keep Auburn (natural)
--   xpulse  Susann          breast-size delete DD/E  (verbose dup),  keep DD (canonical)
--   xpulse  Ivette          breast-size delete B     (no provenance),keep C (notes='Medium (Real)')
--
-- The migration runs on both tenants via scripts/deploy-migrations.sh.
-- DELETE WHERE id IN (...) on the wrong tenant matches 0 rows (no-op).
--
-- After the deletes, recompute affected PersonCurrentState rows so the
-- hero / search-cache reflect the new fold winners in the same tx.

BEGIN;

DELETE FROM "ScalarDelta"
 WHERE id IN (
   -- pulse: hair-color winners to drop
   '85ea77c7-9a14-4f33-a914-a5b84475eed3',  -- Connie / Blonde
   '5aa7d86b-b31d-4c46-9788-55dc41759236',  -- Eva    / Black
   '5cab6514-cc09-4fd2-ac56-9cd6a2e95a32',  -- Nicole / Red
   -- xpulse: breast-size winners to drop
   '1177a233-39bb-47d9-940e-9a7fb8823671',  -- Susann / DD/E
   'cdd55f69-db2a-49df-b57b-7a5ec47bc422'   -- Ivette / B
 );

-- Recompute affected PersonCurrentState rows. Each call is idempotent and a
-- no-op on the wrong tenant (person id doesn't exist there).
SELECT app_recompute_person_current_state('cmm6h5fk500420u9yzmi34wcc');  -- Connie  (pulse)
SELECT app_recompute_person_current_state('cmm6her1k004q0u9ybftnuv2w');  -- Eva     (pulse)
SELECT app_recompute_person_current_state('cmm6hmhhy005f0u9yhmx1m6fk');  -- Nicole  (pulse)
SELECT app_recompute_person_current_state('cmnje9vsk003q01nv2k5uc0xw');  -- Susann  (xpulse)
SELECT app_recompute_person_current_state('cmp5vcnpa014a01qd5wnner75');  -- Ivette  (xpulse)

COMMIT;
