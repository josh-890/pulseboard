-- CreateEnum
CREATE TYPE "ChannelTier" AS ENUM ('PREMIUM', 'HIGH', 'NORMAL', 'LOW', 'TRASH');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "tier" "ChannelTier" NOT NULL DEFAULT 'NORMAL';
