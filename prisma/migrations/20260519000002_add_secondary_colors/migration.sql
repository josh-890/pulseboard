-- Secondary color columns for heterochromia (eyes) + highlights/ombre/etc (hair)
ALTER TABLE "Person"          ADD COLUMN "secondaryEyeColor"        TEXT;
ALTER TABLE "PersonaPhysical" ADD COLUMN "currentSecondaryHairColor" TEXT;
