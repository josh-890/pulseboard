-- Phase C1 follow-up — enforce the "every Person has a baseline Era" invariant.
-- Some persons (e.g. badly-seeded rows) had zero eras, so the C1 data migration
-- could not place their Person-column scalars. Backfill the missing baselines,
-- then migrate those persons' legacy Person columns into ScalarDelta.

INSERT INTO "Persona" ("id","personId","label","isBaseline","isDraft","datePrecision","dateModifier","createdAt")
SELECT
  gen_random_uuid()::text, p.id,
  COALESCE(
    (SELECT a.name FROM "PersonAlias" a WHERE a."personId" = p.id AND a."isCommon" = true LIMIT 1) || ' — initial',
    'Baseline'
  ),
  true, false, 'UNKNOWN', 'EXACT', CURRENT_TIMESTAMP
FROM "Person" p
WHERE NOT EXISTS (SELECT 1 FROM "Persona" e WHERE e."personId" = p.id AND e."isBaseline" = true);

-- Legacy Person columns → ScalarDelta on the baseline. Per-attribute guard so a
-- baseline already carrying that attribute (from the C1 migration) is untouched.
INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-hair-color', p."naturalHairColor", 'UNKNOWN','EXACT',CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p."naturalHairColor" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ScalarDelta" s WHERE s."eraId" = e.id AND s."attributeDefinitionId" = 'cattr-hair-color');

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-breast-size', p."naturalBreastSize", 'UNKNOWN','EXACT',CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p."naturalBreastSize" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ScalarDelta" s WHERE s."eraId" = e.id AND s."attributeDefinitionId" = 'cattr-breast-size');

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-build', p."bodyType", 'UNKNOWN','EXACT',CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p."bodyType" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ScalarDelta" s WHERE s."eraId" = e.id AND s."attributeDefinitionId" = 'cattr-build');

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-measurements', p.measurements, 'UNKNOWN','EXACT',CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p.measurements IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ScalarDelta" s WHERE s."eraId" = e.id AND s."attributeDefinitionId" = 'cattr-measurements');
