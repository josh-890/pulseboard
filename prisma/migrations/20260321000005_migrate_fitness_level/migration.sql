-- ============================================================================
-- Migrate fitnessLevel from PersonaPhysical to Extensible Catalog
-- ============================================================================

-- 1. Add "Fitness Level" definition to "Fitness & Health" group
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, 'Fitness Level', 'fitness-level', NULL, 3, now()
FROM "PhysicalAttributeGroup" g WHERE g.name = 'Fitness & Health'
ON CONFLICT (slug) DO NOTHING;

-- 2. Migrate existing fitnessLevel data to extensible attributes
INSERT INTO "PersonaPhysicalAttribute" (id, "personaPhysicalId", "attributeDefinitionId", value)
SELECT
  gen_random_uuid()::text,
  pp.id,
  (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'fitness-level'),
  pp."fitnessLevel"
FROM "PersonaPhysical" pp
WHERE pp."fitnessLevel" IS NOT NULL
ON CONFLICT ("personaPhysicalId", "attributeDefinitionId") DO NOTHING;

-- 3. Drop MV (depends on fitnessLevel column), drop column, recreate MV
DROP MATERIALIZED VIEW IF EXISTS mv_person_current_state;
ALTER TABLE "PersonaPhysical" DROP COLUMN "fitnessLevel";

-- 4. Recreate mv_person_current_state WITHOUT fitnessLevel
CREATE MATERIALIZED VIEW mv_person_current_state AS
WITH ordered AS (
  SELECT
    per."personId",
    pp."currentHairColor",
    pp.weight,
    pp.build,
    row_number() OVER (PARTITION BY per."personId" ORDER BY per."isBaseline" DESC, per.date NULLS FIRST) AS rn
  FROM "Persona" per
    JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
), folded AS (
  SELECT
    ordered."personId",
    max(ordered."currentHairColor") FILTER (WHERE ordered."currentHairColor" IS NOT NULL) OVER w AS "currentHairColor",
    max(ordered.weight) FILTER (WHERE ordered.weight IS NOT NULL) OVER w AS "currentWeight",
    max(ordered.build) FILTER (WHERE ordered.build IS NOT NULL) OVER w AS "currentBuild",
    ordered.rn,
    max(ordered.rn) OVER (PARTITION BY ordered."personId") AS max_rn
  FROM ordered
  WINDOW w AS (PARTITION BY ordered."personId" ORDER BY ordered.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT "personId", "currentHairColor", "currentWeight", "currentBuild"
FROM folded
WHERE rn = max_rn;

CREATE UNIQUE INDEX ON mv_person_current_state ("personId");
