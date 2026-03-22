-- ============================================================================
-- Seed Physical Attribute Catalog + Migrate visionAids
-- ============================================================================

-- 1. INSERT catalog groups
INSERT INTO "PhysicalAttributeGroup" (id, name, "sortOrder", "createdAt") VALUES
  (gen_random_uuid()::text, 'Facial Features',        1, now()),
  (gen_random_uuid()::text, 'Skin & Complexion',      2, now()),
  (gen_random_uuid()::text, 'Core Body Measurements', 3, now()),
  (gen_random_uuid()::text, 'Clothing & Shoe Sizes',  4, now()),
  (gen_random_uuid()::text, 'Body Composition',       5, now()),
  (gen_random_uuid()::text, 'Fitness & Health',        6, now()),
  (gen_random_uuid()::text, 'Extended Measurements',   7, now())
ON CONFLICT (name) DO NOTHING;

-- 2. INSERT catalog definitions
-- Facial Features
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Hair Texture',  'hair-texture',  NULL::text, 1),
  ('Hair Length',   'hair-length',   NULL,       2),
  ('Facial Hair',   'facial-hair',   NULL,       3),
  ('Face Shape',    'face-shape',    NULL,       4)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Facial Features'
ON CONFLICT (slug) DO NOTHING;

-- Skin & Complexion
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Skin Tone',   'skin-tone',   NULL::text, 1),
  ('Complexion',  'complexion',  NULL,       2),
  ('Undertone',   'undertone',   NULL,       3)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Skin & Complexion'
ON CONFLICT (slug) DO NOTHING;

-- Core Body Measurements
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Bust/Chest',      'bust-chest',      'cm'::text, 1),
  ('Waist',           'waist',           'cm',       2),
  ('Hips',            'hips',            'cm',       3),
  ('Inseam',          'inseam',          'cm',       4),
  ('Shoulder Width',  'shoulder-width',  'cm',       5),
  ('Neck',            'neck',            'cm',       6),
  ('Sleeve Length',   'sleeve-length',   'cm',       7),
  ('Torso Length',    'torso-length',    'cm',       8)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Core Body Measurements'
ON CONFLICT (slug) DO NOTHING;

-- Clothing & Shoe Sizes
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Dress Size',        'dress-size',        NULL::text, 1),
  ('Suit/Jacket Size',  'suit-jacket-size',  NULL,       2),
  ('Shirt Size',        'shirt-size',        NULL,       3),
  ('Trouser Size',      'trouser-size',      NULL,       4),
  ('Shoe Size',         'shoe-size',         NULL,       5),
  ('Bra Size',          'bra-size',          NULL,       6),
  ('Hat Size',          'hat-size',          NULL,       7),
  ('Glove Size',        'glove-size',        NULL,       8)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Clothing & Shoe Sizes'
ON CONFLICT (slug) DO NOTHING;

-- Body Composition
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Body Fat',           'body-fat',           '%'::text,    1),
  ('BMI',                'bmi',                'kg/m²',      2),
  ('Waist-to-Hip Ratio', 'waist-to-hip-ratio', NULL::text,   3)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Body Composition'
ON CONFLICT (slug) DO NOTHING;

-- Fitness & Health
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Vision Aids', 'vision-aids', NULL::text, 1),
  ('Handedness',  'handedness',  NULL,       2)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Fitness & Health'
ON CONFLICT (slug) DO NOTHING;

-- Extended Measurements
INSERT INTO "PhysicalAttributeDefinition" (id, "groupId", name, slug, unit, "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, g.id, d.name, d.slug, d.unit, d.sort_order, now()
FROM "PhysicalAttributeGroup" g
CROSS JOIN (VALUES
  ('Upper Arm',          'upper-arm',          'cm'::text, 1),
  ('Forearm',            'forearm',            'cm',       2),
  ('Thigh',              'thigh',              'cm',       3),
  ('Calf',               'calf',              'cm',       4),
  ('Wrist',              'wrist',              'cm',       5),
  ('Ankle',              'ankle',              'cm',       6),
  ('Head Circumference', 'head-circumference', 'cm',       7),
  ('Arm Span',           'arm-span',           'cm',       8),
  ('Sitting Height',     'sitting-height',     'cm',       9)
) AS d(name, slug, unit, sort_order)
WHERE g.name = 'Extended Measurements'
ON CONFLICT (slug) DO NOTHING;

-- 3. Migrate visionAids data to extensible attributes
INSERT INTO "PersonaPhysicalAttribute" (id, "personaPhysicalId", "attributeDefinitionId", value)
SELECT
  gen_random_uuid()::text,
  pp.id,
  (SELECT id FROM "PhysicalAttributeDefinition" WHERE slug = 'vision-aids'),
  pp."visionAids"
FROM "PersonaPhysical" pp
WHERE pp."visionAids" IS NOT NULL
ON CONFLICT ("personaPhysicalId", "attributeDefinitionId") DO NOTHING;

-- 4. Drop MV first (depends on visionAids column), then drop the column
DROP MATERIALIZED VIEW IF EXISTS mv_person_current_state;
ALTER TABLE "PersonaPhysical" DROP COLUMN "visionAids";

-- 5. Recreate mv_person_current_state WITHOUT visionAids

CREATE MATERIALIZED VIEW mv_person_current_state AS
WITH ordered AS (
  SELECT
    per."personId",
    pp."currentHairColor",
    pp.weight,
    pp.build,
    pp."fitnessLevel",
    row_number() OVER (PARTITION BY per."personId" ORDER BY per."isBaseline" DESC, per.date NULLS FIRST) AS rn
  FROM "Persona" per
    JOIN "PersonaPhysical" pp ON pp."personaId" = per.id
), folded AS (
  SELECT
    ordered."personId",
    max(ordered."currentHairColor") FILTER (WHERE ordered."currentHairColor" IS NOT NULL) OVER w AS "currentHairColor",
    max(ordered.weight) FILTER (WHERE ordered.weight IS NOT NULL) OVER w AS "currentWeight",
    max(ordered.build) FILTER (WHERE ordered.build IS NOT NULL) OVER w AS "currentBuild",
    max(ordered."fitnessLevel") FILTER (WHERE ordered."fitnessLevel" IS NOT NULL) OVER w AS "currentFitnessLevel",
    ordered.rn,
    max(ordered.rn) OVER (PARTITION BY ordered."personId") AS max_rn
  FROM ordered
  WINDOW w AS (PARTITION BY ordered."personId" ORDER BY ordered.rn ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT "personId", "currentHairColor", "currentWeight", "currentBuild", "currentFitnessLevel"
FROM folded
WHERE rn = max_rn;

CREATE UNIQUE INDEX ON mv_person_current_state ("personId");
