-- Boundaries between intensity levels (2026-10-23): a named line on the seam
-- just below a value — a line a person crosses, or gives up.
CREATE TABLE "IntensityBoundary" (
    "id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntensityBoundary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntensityBoundary_value_key" ON "IntensityBoundary"("value");
