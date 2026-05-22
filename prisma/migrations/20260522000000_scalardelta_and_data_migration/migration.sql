-- Phase C1 — ScalarDelta replaces PersonaPhysical + PersonaPhysicalAttribute.
-- Additive only: PersonaPhysical is kept as a safety net until Phase C3.

-- ─── 1. ScalarDelta table ────────────────────────────────────────────────────

CREATE TABLE "ScalarDelta" (
  "id"                    TEXT NOT NULL,
  "eraId"                 TEXT NOT NULL,
  "attributeDefinitionId" TEXT NOT NULL,
  "value"                 TEXT NOT NULL,
  "date"                  TIMESTAMP(3),
  "datePrecision"         "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
  "dateModifier"          "DateModifier"  NOT NULL DEFAULT 'EXACT',
  "dateSource"            TEXT,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScalarDelta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScalarDelta_eraId_idx" ON "ScalarDelta"("eraId");
CREATE INDEX "ScalarDelta_attributeDefinitionId_idx" ON "ScalarDelta"("attributeDefinitionId");
CREATE INDEX "ScalarDelta_date_idx" ON "ScalarDelta"("date");

-- Era's DB table is still "Persona" (Phase A @@map).
ALTER TABLE "ScalarDelta" ADD CONSTRAINT "ScalarDelta_eraId_fkey"
  FOREIGN KEY ("eraId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScalarDelta" ADD CONSTRAINT "ScalarDelta_attributeDefinitionId_fkey"
  FOREIGN KEY ("attributeDefinitionId") REFERENCES "PhysicalAttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 2. Catalog: the legacy scalars become attribute definitions ─────────────

INSERT INTO "PhysicalAttributeGroup" ("id","name","sortOrder","createdAt")
VALUES ('grp-core-physical','Core Physical',0,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "PhysicalAttributeDefinition"
  ("id","groupId","name","slug","unit","valueType","allowedValues","sortOrder","createdAt")
VALUES
  ('cattr-hair-color',  'grp-core-physical','Hair Color',  'hair_color',  NULL,'TEXT'::"PhysicalAttributeValueType",   '{}',1,CURRENT_TIMESTAMP),
  ('cattr-weight',      'grp-core-physical','Weight',      'weight',      'kg','NUMERIC'::"PhysicalAttributeValueType",'{}',2,CURRENT_TIMESTAMP),
  ('cattr-build',       'grp-core-physical','Build',       'build',       NULL,'TEXT'::"PhysicalAttributeValueType",   '{}',3,CURRENT_TIMESTAMP),
  ('cattr-breast-size', 'grp-core-physical','Breast Size', 'breast_size', NULL,'TEXT'::"PhysicalAttributeValueType",   '{}',4,CURRENT_TIMESTAMP),
  ('cattr-measurements','grp-core-physical','Measurements','measurements',NULL,'TEXT'::"PhysicalAttributeValueType",   '{}',5,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ─── 3. Data migration — PersonaPhysical scalar fields → ScalarDelta ─────────
-- Each non-null legacy field becomes one delta on its era, carrying that
-- PersonaPhysical's own date/precision/modifier.

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","date","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, pp."personaId", 'cattr-weight', pp.weight::text,
       pp.date, pp."datePrecision", pp."dateModifier", CURRENT_TIMESTAMP
FROM "PersonaPhysical" pp WHERE pp.weight IS NOT NULL;

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","date","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, pp."personaId", 'cattr-hair-color', pp."currentHairColor",
       pp.date, pp."datePrecision", pp."dateModifier", CURRENT_TIMESTAMP
FROM "PersonaPhysical" pp WHERE pp."currentHairColor" IS NOT NULL;

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","date","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, pp."personaId", 'cattr-build', pp.build,
       pp.date, pp."datePrecision", pp."dateModifier", CURRENT_TIMESTAMP
FROM "PersonaPhysical" pp WHERE pp.build IS NOT NULL;

-- Breast SIZE (the cup letter) is a scalar; breast STATUS becomes a procedure
-- (separate step). breastDescription rides along as raw provenance in notes.
INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","date","datePrecision","dateModifier","notes","createdAt")
SELECT gen_random_uuid()::text, pp."personaId", 'cattr-breast-size', pp."breastSize",
       pp.date, pp."datePrecision", pp."dateModifier", pp."breastDescription", CURRENT_TIMESTAMP
FROM "PersonaPhysical" pp WHERE pp."breastSize" IS NOT NULL;

-- ─── 4. PersonaPhysicalAttribute → ScalarDelta ──────────────────────────────
-- Extensible attribute values; date inherited from the owning PersonaPhysical.

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","date","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, pp."personaId", ppa."attributeDefinitionId", ppa.value,
       pp.date, pp."datePrecision", pp."dateModifier", CURRENT_TIMESTAMP
FROM "PersonaPhysicalAttribute" ppa
JOIN "PersonaPhysical" pp ON pp.id = ppa."personaPhysicalId";

-- ─── 5. Legacy Person columns → ScalarDelta on the baseline Era ─────────────

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-hair-color', p."naturalHairColor", 'UNKNOWN', 'EXACT', CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p."naturalHairColor" IS NOT NULL;

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-breast-size', p."naturalBreastSize", 'UNKNOWN', 'EXACT', CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p."naturalBreastSize" IS NOT NULL;

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-build', p."bodyType", 'UNKNOWN', 'EXACT', CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p."bodyType" IS NOT NULL;

INSERT INTO "ScalarDelta" ("id","eraId","attributeDefinitionId","value","datePrecision","dateModifier","createdAt")
SELECT gen_random_uuid()::text, e.id, 'cattr-measurements', p.measurements, 'UNKNOWN', 'EXACT', CURRENT_TIMESTAMP
FROM "Person" p JOIN "Persona" e ON e."personId" = p.id AND e."isBaseline" = true
WHERE p.measurements IS NOT NULL;
