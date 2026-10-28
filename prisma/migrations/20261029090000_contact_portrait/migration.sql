-- ADR-0038: a portrait the user chose for a Contact (sticks over the catalogue portrait)
ALTER TABLE "PersonRef" ADD COLUMN "portraitKey" TEXT;
