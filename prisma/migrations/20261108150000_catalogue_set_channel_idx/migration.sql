-- The channel page's Sets tab (2026-11-08) finds a channel's catalogue sets by
-- its import aliases, matched case-insensitively — an expression index so it
-- does not scan all ~985k rows. (Not expressible in schema.prisma.)
CREATE INDEX IF NOT EXISTS "catalogue_set_channel_upper_idx" ON "catalogue_set" (upper(trim("channelName")));
