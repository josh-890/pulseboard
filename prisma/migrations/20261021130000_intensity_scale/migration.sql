-- ADR-0036: the intensity scale — a title and a description for each value,
-- in the user's words. The catalog's first column; acts line up beside the
-- value of their level.

CREATE TABLE "IntensityScaleStep" (
    "id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntensityScaleStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntensityScaleStep_value_key" ON "IntensityScaleStep"("value");
