-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "focalSource" TEXT,
ADD COLUMN     "focalStatus" TEXT,
ADD COLUMN     "focalX" DOUBLE PRECISION,
ADD COLUMN     "focalY" DOUBLE PRECISION,
ADD COLUMN     "modelVersion" TEXT;
