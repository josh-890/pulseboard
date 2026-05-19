-- Typed PhysicalAttribute values. Each definition now carries a value type
-- (Boolean / Single-select / Multi-select / Ordinal / Numeric / Text) plus
-- the metadata that type needs (allowedValues for selects, ordinalMin/Max
-- for ordinal). Data migration to populate types from existing `unit` hints
-- runs separately via scripts/migrate-attribute-types.ts.

CREATE TYPE "PhysicalAttributeValueType" AS ENUM (
  'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'ORDINAL', 'NUMERIC', 'TEXT'
);

ALTER TABLE "PhysicalAttributeDefinition"
  ADD COLUMN "valueType"     "PhysicalAttributeValueType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "allowedValues" TEXT[]                       NOT NULL DEFAULT '{}',
  ADD COLUMN "ordinalMin"    INT,
  ADD COLUMN "ordinalMax"    INT;
