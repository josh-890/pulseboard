-- Person: natural breast size (static birth trait)
ALTER TABLE "Person" ADD COLUMN "naturalBreastSize" TEXT;

-- PersonaPhysical: time-varying breast tracking
ALTER TABLE "PersonaPhysical" ADD COLUMN "breastSize" TEXT;
ALTER TABLE "PersonaPhysical" ADD COLUMN "breastStatus" TEXT;
ALTER TABLE "PersonaPhysical" ADD COLUMN "breastDescription" TEXT;
