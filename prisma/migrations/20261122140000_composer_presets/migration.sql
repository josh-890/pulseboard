-- Composer presets (ADR-0042, S6): named compositions. Additive.
CREATE TABLE "composer_preset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adds" TEXT[],
    "removes" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "composer_preset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "composer_preset_name_key" ON "composer_preset"("name");
