-- Phase C3 — drop the legacy PersonaPhysical / PersonaPhysicalAttribute tables.
-- First: any remaining breastStatus='enhanced' rows become CosmeticProcedures
-- (the "Enhanced" status is derived from procedures, never stored — plan §4.2).

-- A draft "Imported — undated changes" era for each enhanced person lacking one.
INSERT INTO "Persona" ("id","personId","label","isBaseline","isDraft","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, t."personId", 'Imported — undated changes', false, true, 'UNKNOWN', 'EXACT', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT per."personId"
  FROM "PersonaPhysical" pp JOIN "Persona" per ON per.id = pp."personaId"
  WHERE pp."breastStatus" = 'enhanced'
) t
WHERE NOT EXISTS (
  SELECT 1 FROM "Persona" e
  WHERE e."personId" = t."personId" AND e.label = 'Imported — undated changes' AND e."isDraft" = true
)
AND NOT EXISTS (
  SELECT 1 FROM "CosmeticProcedure" cp
  WHERE cp."personId" = t."personId" AND cp."attributeDefinitionId" = 'cattr-breast-size'
);

-- A breast-augmentation procedure + undated `performed` event per enhanced
-- person (skipping anyone already converted).
WITH enhanced AS (
  SELECT DISTINCT ON (per."personId")
    per."personId" AS person_id, pp."breastSize" AS breast_size, pp."breastDescription" AS breast_desc
  FROM "PersonaPhysical" pp JOIN "Persona" per ON per.id = pp."personaId"
  WHERE pp."breastStatus" = 'enhanced'
    AND NOT EXISTS (
      SELECT 1 FROM "CosmeticProcedure" cp
      WHERE cp."personId" = per."personId" AND cp."attributeDefinitionId" = 'cattr-breast-size'
    )
  ORDER BY per."personId", pp.date DESC NULLS LAST
),
ins_proc AS (
  INSERT INTO "CosmeticProcedure"
    ("id","personId","type","bodyRegion","bodyRegions","description","status","attributeDefinitionId","heroVisible","createdAt")
  SELECT gen_random_uuid()::text, e.person_id, 'breast augmentation', 'chest', ARRAY['chest']::text[],
         e.breast_desc, 'completed', 'cattr-breast-size', true, CURRENT_TIMESTAMP
  FROM enhanced e
  RETURNING id, "personId"
)
INSERT INTO "CosmeticProcedureEvent"
  ("id","cosmeticProcedureId","personaId","eventType","datePrecision","dateModifier","bodyRegions","valueAfter","notes")
SELECT
  gen_random_uuid()::text, ip.id,
  (SELECT dr.id FROM "Persona" dr
     WHERE dr."personId" = ip."personId" AND dr.label = 'Imported — undated changes' AND dr."isDraft" = true
     LIMIT 1),
  'performed'::"CosmeticProcedureEventType", 'UNKNOWN'::"DatePrecision", 'EXACT'::"DateModifier",
  ARRAY[]::text[],
  (SELECT e.breast_size FROM enhanced e WHERE e.person_id = ip."personId"),
  'import: enhanced breast status'
FROM ins_proc ip;

-- Drop the superseded tables (Attribute first — it FKs PersonaPhysical).
DROP TABLE "PersonaPhysicalAttribute";
DROP TABLE "PersonaPhysical";
